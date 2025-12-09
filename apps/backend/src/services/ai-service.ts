import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc } from 'drizzle-orm';
import type { AIPromptPayload } from '@mathboard/shared';
import { GoogleGenerativeAI, type GenerativeModel, type Part, type Content } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as schema from '../db/schema.js';

const DEFAULT_VISION_MODEL = 'gemini-2.0-flash';

type Database = NodePgDatabase<typeof schema>;

interface AiServiceDeps {
  db: Database;
  geminiKey: string;
  openaiKey?: string;
  anthropicKey?: string;
}

interface CaptureRecord {
  id: string;
  imageUrl: string;
  scene: unknown;
  width: number;
  height: number;
  byteSize: number;
}

export interface AiAnalysisResult {
  status: 'completed';
  message: string;
  provider: string;
  model: string;
  strategy: 'vision' | 'text';
  captureId?: string | null;
}

export class AiService {
  private readonly db: Database;
  private readonly genAI: GoogleGenerativeAI;
  private readonly openai?: OpenAI;
  private readonly anthropic?: Anthropic;

  constructor({ db, geminiKey, openaiKey, anthropicKey }: AiServiceDeps) {
    this.db = db;
    this.genAI = new GoogleGenerativeAI(geminiKey);

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }

  async analyze(payload: AIPromptPayload): Promise<AiAnalysisResult> {
    const capture = payload.captureId ? await this.loadCapture(payload.captureId) : null;
    const history = await this.loadHistory(payload.conversationId);
    const wantsVision = Boolean(capture);
    const provider = payload.provider || 'google';
    const model = payload.model || DEFAULT_VISION_MODEL;

    try {
      let message = '';
      if (provider === 'openai' && this.openai) {
        message = await this.generateWithOpenAI(payload, capture, history, model);
      } else if (provider === 'anthropic' && this.anthropic) {
        message = await this.generateWithAnthropic(payload, capture, history, model);
      } else {
        // Default to Gemini
        message = await this.generateWithGemini(payload, capture, history, model);
      }

      return {
        status: 'completed',
        message,
        provider,
        model,
        strategy: wantsVision ? 'vision' : 'text',
        captureId: payload.captureId
      };
    } catch (error) {
      console.error(`${provider} analysis failed`, error);
      throw new Error('AI analysis failed');
    }
  }

  private async loadHistory(conversationId: string) {
    return this.db
      .select({
        role: schema.messages.role,
        content: schema.messages.content
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.createdAt))
      .limit(20); // Limit context window
  }

  private async loadCapture(id: string): Promise<CaptureRecord | null> {
    const [capture] = await this.db
      .select({
        id: schema.captures.id,
        imageUrl: schema.captures.imageUrl,
        scene: schema.captures.scene,
        width: schema.captures.width,
        height: schema.captures.height,
        byteSize: schema.captures.byteSize
      })
      .from(schema.captures)
      .where(eq(schema.captures.id, id));

    return capture ?? null;
  }

  private async generateWithGemini(
    payload: AIPromptPayload,
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ) {
    const geminiModel = this.genAI.getGenerativeModel({
      model: model || DEFAULT_VISION_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        topP: 0.9
      }
    });

    const contents: Content[] = [];

    // 1. Add history
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    // 2. Add current turn
    const currentParts: Part[] = [{ text: this.buildSystemPrompt(payload.locale, capture, payload.boardVersion) }];

    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      currentParts.push({
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      });
    }

    currentParts.push({ text: `Demande de l'élève: ${payload.prompt}` });

    contents.push({
      role: 'user',
      parts: currentParts
    });

    const result = await geminiModel.generateContent({ contents });

    const text = result.response.text()?.trim();
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return this.cleanResponse(text);
  }

  private async generateWithOpenAI(
    payload: AIPromptPayload,
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ) {
    if (!this.openai) throw new Error('OpenAI not configured');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(payload.locale, capture, payload.boardVersion) }
    ];

    for (const msg of history) {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: `Demande de l'élève: ${payload.prompt}` }
    ];

    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64Image}`
        }
      });
    }

    messages.push({ role: 'user', content: userContent });

    const response = await this.openai.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.2
    });

    return this.cleanResponse(response.choices[0].message.content || '');
  }

  private async generateWithAnthropic(
    payload: AIPromptPayload,
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ) {
    if (!this.anthropic) throw new Error('Anthropic not configured');

    const system = this.buildSystemPrompt(payload.locale, capture, payload.boardVersion);
    const messages: Anthropic.Messages.MessageParam[] = [];

    for (const msg of history) {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }

    const userContent: Anthropic.Messages.ContentBlockParam[] = [
      { type: 'text', text: `Demande de l'élève: ${payload.prompt}` }
    ];

    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Image
        }
      });
    }

    messages.push({ role: 'user', content: userContent });

    const response = await this.anthropic.messages.create({
      model: model || 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.2,
      system,
      messages
    });

    // Anthropic response content is an array of blocks
    const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
    return this.cleanResponse(text);
  }

  private cleanResponse(text: string): string {
    // Nettoyage post-traitement pour corriger les tics de Gemini
    
    // 1. Supprimer les blocs de code Markdown qui entourent du LaTeX (ex: ```latex $$...$$ ```)
    let cleaned = text.replace(/```(?:latex|math|tex)?\s*(\$\$?[\s\S]*?\$\$?)\s*```/gi, '$1');

    // 2. Tentative de suppression des doublons "LaTeX + Texte brut" simples
    // Ex: $x=2$ x=2 -> $x=2$
    // C'est une heuristique simple qui cherche une répétition immédiate du contenu (sans les commandes latex)
    // On ne l'applique que si la répétition est courte pour éviter les faux positifs
    
    // (Cette partie est risquée, on s'en tient au nettoyage des blocs de code pour l'instant 
    // car la déduplication sémantique est complexe sans parser le LaTeX)

    return cleaned;
  }

  private buildSystemPrompt(
    locale: 'fr' | 'en',
    capture: CaptureRecord | null,
    boardVersion?: number
  ): string {
    const language = locale === 'en' ? 'anglais clair' : 'français lycéen';
    const summary = capture
      ? `La scène mesure ${capture.width}×${capture.height}px et contient environ ${this.describeScene(
          capture.scene
        )}.`
      : 'Aucune capture disponible; appuie-toi uniquement sur la question textuelle.';

    const versionLine = boardVersion !== undefined
      ? `Version du tableau: ${boardVersion}. Si une image est jointe, elle correspond à cette version. Ignore toute information relative à des versions antérieures.`
      : undefined;

    return [
      'Tu es « Le Prof Artificiel », un tuteur de mathématiques bienveillant et concis.',
      'Ton objectif : Aider l\'élève à réussir par lui-même.',
      'Règles :',
      '1. Sois BREF et DIRECT. Évite les longues explications si elles ne sont pas demandées.',
      '2. Si l\'élève demande une vérification : Valide ce qui est juste. Si c\'est faux, explique pourquoi sans donner la réponse.',
      '3. Pour les erreurs : Indique précisément où est le problème et pose une question guide pour débloquer.',
      '4. Ne fais pas le travail à la place de l\'élève.',
      '5. FORMATAGE MATHÉMATIQUE : Utilise EXCLUSIVEMENT LaTeX (avec $ ou $$). INTERDICTION ABSOLUE de répéter la formule en texte brut. Si tu écris une formule en LaTeX, NE L\'ÉCRIS PAS en texte à côté. Exemple : Écris « $x^2$ » et NON « $x^2$ x^2 ».',
      `Rédige en ${language}.`,
      summary,
      versionLine
    ].filter(Boolean).join('\n');
  }

  private describeScene(scene: unknown): string {
    try {
      if (!scene || typeof scene !== 'object') {
        return 'aucune métadonnée exploitable';
      }
      const snapshot = scene as { elements?: Array<Record<string, unknown>> };
      const count = snapshot.elements?.length ?? 0;
      const labels = (snapshot.elements ?? [])
        .map((element) => {
          const text = element?.['text'];
          if (typeof text === 'string' && text.trim()) return text.trim();
          const label = element?.['label'];
          if (typeof label === 'string' && label.trim()) return label.trim();
          return null;
        })
        .filter(Boolean)
        .slice(0, 5)
        .join(', ');

      return labels ? `${count} éléments (ex: ${labels})` : `${count} éléments sans texte explicite`;
    } catch (error) {
      console.warn('Failed to describe scene', error);
      return 'métadonnées illisibles';
    }
  }

  private async readImageAsBase64(imagePath: string): Promise<string> {
    const resolved = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(process.cwd(), imagePath);
    const data = await readFile(resolved);
    return data.toString('base64');
  }
}
