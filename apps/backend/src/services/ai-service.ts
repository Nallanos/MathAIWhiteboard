import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, desc, gt, gte } from 'drizzle-orm';
import type { AIPromptPayload, TutorPlan as SharedTutorPlan, TutorState as SharedTutorState, TutorPayload as SharedTutorPayload } from '@mathboard/shared';
import { GoogleGenerativeAI, type GenerativeModel, type Part, type Content } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as schema from '../db/schema.js';
import { sql } from 'drizzle-orm';
import {
  normalizeTutorState as normalizeTutorStateZod,
  safeParseTutorPlan
} from '../ai/tutor-schemas.js';

const DEFAULT_VISION_MODEL = 'gemini-2.0-flash';
const PREMIUM_GOOGLE_MODEL = 'gemini-3-flash-preview';
const GOOGLE_ALLOWED_MODELS = new Set([DEFAULT_VISION_MODEL, PREMIUM_GOOGLE_MODEL, 'gemini-3-flash']);
const DEFAULT_DAILY_CREDITS = 25;

export class ModelUnavailableError extends Error {
  constructor(message = 'Ce modèle n\'est pas disponible pour cette clé API.') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export class InsufficientCreditsError extends Error {
  constructor(message = 'Crédits insuffisants pour utiliser ce modèle.') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

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
  tutor?: SharedTutorPayload;
  aiCreditsRemaining?: number;
}

interface TutoringSessionRecord {
  id: string;
  conversationId: string;
  userId: string;
  boardId: string;
  status: string;
  plan: unknown | null;
  state: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export class AiService {
  private readonly db: Database;
  private readonly genAI: GoogleGenerativeAI;
  private readonly openai?: OpenAI;
  private readonly anthropic?: Anthropic;
  private readonly geminiKey: string;

  private googleModelsCache:
    | { expiresAt: number; models: Set<string> }
    | null = null;

  constructor({ db, geminiKey, openaiKey, anthropicKey }: AiServiceDeps) {
    this.db = db;
    this.geminiKey = geminiKey;
    this.genAI = new GoogleGenerativeAI(geminiKey);

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }

  async analyze(payload: AIPromptPayload, userId: string): Promise<AiAnalysisResult> {
    const chatMode = payload.chatMode ?? 'board';

    const capture = payload.captureId
      ? await this.loadCapture(payload.captureId)
      : null;

    const wantsVision = Boolean(capture);
    // Only board mode uses the aggressive "ignore history" heuristic.
    // Tutor mode needs short conversational continuity.
    const ignoreHistoryForVision = chatMode === 'board' && wantsVision && this.shouldIgnoreHistoryForVision(payload.prompt);

    const historyLimit = chatMode === 'tutor'
      ? 6
      : wantsVision
        ? (ignoreHistoryForVision ? 0 : 6)
        : 20;

    const history = historyLimit > 0
      ? await this.loadHistory(payload.conversationId, historyLimit)
      : [];

    const provider = payload.provider || 'google';
    const model = provider === 'google'
      ? this.resolveGoogleModel(payload.model)
      : (payload.model || DEFAULT_VISION_MODEL);

    const shouldCharge = provider === 'google' && model === PREMIUM_GOOGLE_MODEL;
    let reservedCredit = false;
    let aiCreditsRemaining: number | undefined = undefined;

    if (shouldCharge) {
      const available = await this.isGoogleModelAvailable(model);
      if (!available) {
        throw new ModelUnavailableError(
          `Modèle indisponible: ${model}. Utilise ${DEFAULT_VISION_MODEL} ou vérifie les modèles disponibles pour ta clé Google.`
        );
      }
      await this.ensureCreditsFresh(userId);
      const remaining = await this.tryConsumeCredits(userId, 1);
      if (typeof remaining !== 'number') {
        throw new InsufficientCreditsError(
          `Crédits insuffisants: ${PREMIUM_GOOGLE_MODEL} coûte 1 crédit. Utilise ${DEFAULT_VISION_MODEL} (gratuit) ou recharge tes crédits.`
        );
      }
      reservedCredit = true;
      aiCreditsRemaining = remaining;
    }

    try {
      if (chatMode === 'tutor') {
        const result = await this.analyzeTutor(payload, userId, capture, model, history);
        return {
          status: 'completed',
          message: result.message,
          provider: 'google',
          model,
          strategy: wantsVision ? 'vision' : 'text',
          captureId: payload.captureId,
          tutor: result.tutor,
          aiCreditsRemaining
        };
      }

      let message = '';
      if (provider === 'openai' && this.openai) {
        message = await this.generateWithOpenAI(payload, chatMode, capture, history, model);
      } else if (provider === 'anthropic' && this.anthropic) {
        message = await this.generateWithAnthropic(payload, chatMode, capture, history, model);
      } else {
        // Default to Gemini
        message = await this.generateWithGemini(payload, chatMode, capture, history, model);
      }

      return {
        status: 'completed',
        message,
        provider,
        model,
        strategy: wantsVision ? 'vision' : 'text',
        captureId: payload.captureId,
        aiCreditsRemaining
      };
    } catch (error) {
      if (reservedCredit) {
        try {
          await this.refundCredits(userId, 1);
        } catch (refundError) {
          console.error('Failed to refund AI credits', refundError);
        }
      }

      if (error instanceof InsufficientCreditsError) {
        throw error;
      }

      if (error instanceof ModelUnavailableError) {
        throw error;
      }

      // If Google returns a 404 for a requested model, surface it clearly.
      const maybeAny = error as any;
      if (provider === 'google' && maybeAny?.status === 404) {
        throw new ModelUnavailableError(
          `Modèle indisponible: ${model}. (Google API v1beta a répondu 404).`
        );
      }

      console.error(`${provider} analysis failed`, error);
      throw new Error('AI analysis failed');
    }
  }

  async getGoogleModelAvailability(): Promise<{ freeModel: string; premiumModel: string; premiumAvailable: boolean }> {
    const freeModel = DEFAULT_VISION_MODEL;
    const premiumModel = PREMIUM_GOOGLE_MODEL;
    const premiumAvailable = await this.isGoogleModelAvailable(premiumModel);
    return { freeModel, premiumModel, premiumAvailable };
  }

  private resolveGoogleModel(model?: string): string {
    if (model === 'gemini-3-flash') return PREMIUM_GOOGLE_MODEL;
    if (model && GOOGLE_ALLOWED_MODELS.has(model)) return model;
    return DEFAULT_VISION_MODEL;
  }

  private async isGoogleModelAvailable(modelId: string): Promise<boolean> {
    // Free model is assumed available; if not, the request will fail anyway.
    if (modelId === DEFAULT_VISION_MODEL) return true;

    const now = Date.now();
    if (!this.googleModelsCache || this.googleModelsCache.expiresAt <= now) {
      this.googleModelsCache = await this.fetchGoogleModels();
    }
    return this.googleModelsCache.models.has(modelId);
  }

  private async fetchGoogleModels(): Promise<{ expiresAt: number; models: Set<string> }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.geminiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      // Fail closed: if we can't list models, treat premium as unavailable.
      return { expiresAt: Date.now() + 10 * 60_000, models: new Set([DEFAULT_VISION_MODEL]) };
    }

    const body = (await res.json()) as any;
    const list = Array.isArray(body?.models) ? body.models : [];

    const models = new Set<string>();
    for (const m of list) {
      const name: unknown = m?.name;
      // v1beta returns "models/<id>"
      if (typeof name === 'string' && name.startsWith('models/')) {
        models.add(name.slice('models/'.length));
      }
    }

    // Cache 10 minutes
    return { expiresAt: Date.now() + 10 * 60_000, models };
  }

  private startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async ensureCreditsFresh(userId: string): Promise<void> {
    const now = new Date();
    const today = this.startOfUtcDay(now);

    await this.db
      .update(schema.users)
      .set({
        aiCredits: DEFAULT_DAILY_CREDITS,
        aiCreditsResetAt: now
      })
      .where(and(eq(schema.users.id, userId), sql<boolean>`${schema.users.aiCreditsResetAt} < ${today}`));
  }

  private async tryConsumeCredits(userId: string, amount: number): Promise<number | null> {
    if (amount <= 0) return null;
    const updated = await this.db
      .update(schema.users)
      .set({ aiCredits: sql<number>`${schema.users.aiCredits} - ${amount}` })
      .where(and(eq(schema.users.id, userId), gte(schema.users.aiCredits, amount)))
      .returning({ aiCredits: schema.users.aiCredits });
    return updated[0]?.aiCredits ?? null;
  }

  private async refundCredits(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    await this.db
      .update(schema.users)
      .set({ aiCredits: sql<number>`${schema.users.aiCredits} + ${amount}` })
      .where(eq(schema.users.id, userId));
  }

  private async loadHistory(conversationId: string, limit: number) {
    const rows = await this.db
      .select({
        role: schema.messages.role,
        content: schema.messages.content
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit);

    // We fetch newest first for efficiency; reverse to keep chronological order.
    return rows.reverse();
  }

  private shouldIgnoreHistoryForVision(prompt: string): boolean {
    const p = prompt.toLowerCase();

    // FR: focus on "read what's on the board" intents
    if (
      /\blis\b/.test(p) ||
      /\brelis\b/.test(p) ||
      /ce que j['’]ai (écrit|marqué|noté)/.test(p) ||
      /sur le tableau/.test(p) ||
      /qu['’]est-ce qui est (écrit|marqué)/.test(p)
    ) {
      return true;
    }

    // EN
    if (
      /read (what|this)/.test(p) ||
      /what('?s| is) (written|on the board)/.test(p) ||
      /what i (wrote|typed|put)/.test(p) ||
      /on the (board|whiteboard)/.test(p)
    ) {
      return true;
    }

    return false;
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

  private async getOrCreateTutoringSession(
    conversationId: string,
    userId: string,
    boardId: string
  ): Promise<TutoringSessionRecord> {
    const [existing] = await this.db
      .select()
      .from(schema.tutoringSessions)
      .where(and(eq(schema.tutoringSessions.conversationId, conversationId), eq(schema.tutoringSessions.userId, userId)))
      .limit(1);

    if (existing) return existing as any;

    const [created] = await this.db
      .insert(schema.tutoringSessions)
      .values({
        conversationId,
        userId,
        boardId,
        status: 'active',
        plan: null,
        state: { currentStepId: null, completedStepIds: [] },
        updatedAt: new Date()
      })
      .returning();

    return created as any;
  }

  private findNextIncompleteStepId(plan: SharedTutorPlan, completed: Set<string>): string | null {
    for (const step of plan.steps ?? []) {
      if (step?.id && !completed.has(step.id)) return step.id;
    }
    return null;
  }

  private async setTutoringSessionPlanAndState(
    sessionId: string,
    userId: string,
    plan: SharedTutorPlan,
    state: SharedTutorState
  ): Promise<void> {
    await this.db
      .update(schema.tutoringSessions)
      .set({
        plan,
        state,
        updatedAt: new Date()
      })
      .where(and(eq(schema.tutoringSessions.id, sessionId), eq(schema.tutoringSessions.userId, userId)));
  }

  private async analyzeTutor(
    payload: AIPromptPayload,
    userId: string,
    capture: CaptureRecord | null,
    model: string,
    history: { role: string; content: string }[]
  ): Promise<{ message: string; tutor: SharedTutorPayload }> {
    const session = await this.getOrCreateTutoringSession(payload.conversationId, userId, payload.boardId);

    const existingPlan = session.plan ?? null;
    const parsedPlan = safeParseTutorPlan(existingPlan);
    const plan: SharedTutorPlan | null = parsedPlan.ok ? (parsedPlan.plan as unknown as SharedTutorPlan) : null;
    let state = normalizeTutorStateZod(session.state ?? null);

    let effectivePlan: SharedTutorPlan;
    if (!plan) {
      effectivePlan = await this.generateTutorPlanWithGemini(payload, capture, model);
      const nextId = effectivePlan.steps?.[0]?.id ?? null;
      state = { currentStepId: nextId, completedStepIds: [] };
      await this.setTutoringSessionPlanAndState(session.id, userId, effectivePlan, state);
    } else {
      effectivePlan = plan;
      const completed = new Set(state.completedStepIds);
      const remaining = (effectivePlan.steps ?? []).filter((s) => s?.id && !completed.has(s.id));

      // If all steps were completed, treat the next prompt as a new exercise:
      // generate a fresh plan and reset state.
      if (remaining.length === 0) {
        effectivePlan = await this.generateTutorPlanWithGemini(payload, capture, model);
        const nextId = effectivePlan.steps?.[0]?.id ?? null;
        state = { currentStepId: nextId, completedStepIds: [] };
        await this.setTutoringSessionPlanAndState(session.id, userId, effectivePlan, state);
      } else {
        const next = state.currentStepId && !completed.has(state.currentStepId)
          ? state.currentStepId
          : this.findNextIncompleteStepId(effectivePlan, completed);

        if (next !== state.currentStepId) {
          state = { ...state, currentStepId: next };
          await this.setTutoringSessionPlanAndState(session.id, userId, effectivePlan, state);
        }
      }
    }

    const completed = new Set(state.completedStepIds);
    const currentStepId = state.currentStepId ?? this.findNextIncompleteStepId(effectivePlan, completed);

    if (!currentStepId) {
      return {
        message: "Toutes les étapes sont terminées. Envoie un nouvel énoncé / une nouvelle question pour générer un nouveau plan.",
        tutor: { plan: effectivePlan, state: { ...state, currentStepId: null } }
      };
    }

    const currentStep = effectivePlan.steps.find((s) => s.id === currentStepId) ?? effectivePlan.steps[0];
    const message = await this.generateTutorStepWithGemini(payload, capture, effectivePlan, state, currentStepId, currentStep, model, history);

    return {
      message,
      tutor: { plan: effectivePlan, state: { ...state, currentStepId } }
    };
  }

  private extractJsonObject(text: string): string {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return text;
    return text.slice(first, last + 1);
  }

  private async generateTutorPlanWithGemini(
    payload: AIPromptPayload,
    capture: CaptureRecord | null,
    model: string
  ): Promise<SharedTutorPlan> {
    const geminiModel = this.genAI.getGenerativeModel({
      model: model || DEFAULT_VISION_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        topP: 0.9,
        // Some SDK versions support this; if ignored it's fine.
        // @ts-ignore
        responseMimeType: 'application/json'
      }
    });

    const parts: Part[] = [];
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      });
    }

    const instruction = [
      'Tu es un planner de tuteur de maths.',
      'Ta tâche: produire un plan d\'exercice sous forme de JSON STRICT (aucun markdown, aucun texte hors JSON).',
      'Langue: français.',
      'Contraintes:',
      '- 3 à 8 étapes maximum.',
      '- ids stables: step_1, step_2, ...',
      '- Chaque étape doit être actionnable et petite.',
      '- hint_policy: dont_give_full_solution | guided | direct',
      '',
      'Schéma JSON exact:',
      '{',
      '  "goal": "string",',
      '  "prerequisites": ["string"],',
      '  "common_mistakes": ["string"],',
      '  "steps": [',
      '    {',
      '      "id": "step_1",',
      '      "title": "string",',
      '      "success_criteria": ["string"],',
      '      "hint_policy": "guided"',
      '    }',
      '  ]',
      '}',
      '',
      `Contexte tableau (résumé): ${capture ? this.describeScene(capture.scene) : 'aucune capture'}.`,
      `Énoncé / demande de l'élève: ${payload.prompt}`
    ].join('\n');

    parts.push({ text: instruction });

    const result = await geminiModel.generateContent({
      contents: [
        {
          role: 'user',
          parts
        }
      ]
    });

    const text = result.response.text()?.trim();
    if (!text) throw new Error('Empty plan response');

    const raw = this.extractJsonObject(text);
    const parsed = JSON.parse(raw);

    const validated = safeParseTutorPlan(parsed);
    if (!validated.ok) {
      throw new Error(`Tutor plan JSON invalid: ${validated.error}`);
    }

    return validated.plan as unknown as SharedTutorPlan;
  }

  private async generateTutorStepWithGemini(
    payload: AIPromptPayload,
    capture: CaptureRecord | null,
    plan: SharedTutorPlan,
    state: SharedTutorState,
    currentStepId: string,
    currentStep: SharedTutorPlan['steps'][number],
    model: string,
    history: { role: string; content: string }[]
  ): Promise<string> {
    const geminiModel = this.genAI.getGenerativeModel({
      model: model || DEFAULT_VISION_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        topP: 0.9
      }
    });

    const parts: Part[] = [];
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      });
    }

    const sys = [
      'Tu es « Le Prof Artificiel », un tuteur de mathématiques.',
      'Mode PENSER: tu dois suivre un plan (todos) et ne traiter que l\'étape courante.',
      'Tu réponds en français (niveau lycée).',
      'Règles:',
      '- Donne UNIQUEMENT l\'étape courante: une action courte + un mini indice si besoin.',
      '- Pose EXACTEMENT UNE question de validation à la fin.',
      '- Ne donne pas la correction complète.',
      '- FORMATAGE MATH : LaTeX uniquement ($ ou $$), sans duplication en texte brut.',
      capture ? 'Si une capture est présente, elle est la source de vérité.' : 'Aucune capture.'
    ].join('\n');

    const historyText = (history ?? []).slice(-6).map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      return `${role.toUpperCase()}: ${m.content}`;
    }).join('\n');

    const context = [
      sys,
      '',
      capture ? `SCENE_SUMMARY: ${this.describeScene(capture.scene)}` : 'SCENE_SUMMARY: none',
      '',
      historyText ? ['HISTORIQUE_RECENT:', historyText, ''].join('\n') : undefined,
      'PLAN_JSON:',
      JSON.stringify(plan),
      '',
      'STATE_JSON:',
      JSON.stringify(state),
      '',
      `ETAPE_COURANTE_ID: ${currentStepId}`,
      `ETAPE_COURANTE_TITRE: ${currentStep.title}`,
      `CRITERES: ${(currentStep.success_criteria ?? []).join(' | ')}`,
      '',
      `Demande de l'élève: ${payload.prompt}`
    ].filter(Boolean).join('\n');

    parts.push({ text: context });

    const result = await geminiModel.generateContent({
      contents: [
        {
          role: 'user',
          parts
        }
      ]
    });

    const text = result.response.text()?.trim();
    if (!text) throw new Error('Empty tutor step response');
    return this.cleanResponse(text);
  }

  private async generateWithGemini(
    payload: AIPromptPayload,
    chatMode: 'board' | 'tutor',
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
    const currentParts: Part[] = [];

    // IMPORTANT: image first (vision-first), then instructions, then the prompt
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      currentParts.push({
        inlineData: {
          data: base64Image,
          mimeType: 'image/png'
        }
      });
    }

    currentParts.push({ text: this.buildSystemPrompt(payload.locale, chatMode, capture, payload.boardVersion) });
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
    chatMode: 'board' | 'tutor',
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ) {
    if (!this.openai) throw new Error('OpenAI not configured');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(payload.locale, chatMode, capture, payload.boardVersion) }
    ];

    for (const msg of history) {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    // IMPORTANT: image first (vision-first), then the user's request
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64Image}`
        }
      });
    }

    userContent.push({ type: 'text', text: `Demande de l'élève: ${payload.prompt}` });

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
    chatMode: 'board' | 'tutor',
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ) {
    if (!this.anthropic) throw new Error('Anthropic not configured');

    const system = this.buildSystemPrompt(payload.locale, chatMode, capture, payload.boardVersion);
    const messages: Anthropic.Messages.MessageParam[] = [];

    for (const msg of history) {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }

    const userContent: Anthropic.Messages.ContentBlockParam[] = [];

    // IMPORTANT: image first (vision-first), then the user's request
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

    userContent.push({ type: 'text', text: `Demande de l'élève: ${payload.prompt}` });

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
    chatMode: 'board' | 'tutor',
    capture: CaptureRecord | null,
    boardVersion?: number
  ): string {
    const language = locale === 'en' ? 'anglais clair' : 'français (niveau lycée)';

    const versionLine = boardVersion !== undefined
      ? `Version du tableau: ${boardVersion}. Si une image est jointe, elle correspond à cette version.`
      : undefined;

    const boardSummary = capture
      ? `Capture fournie (image + scène). Aperçu scène: ${this.describeScene(capture.scene)}.`
      : 'Aucune capture fournie.';

    const modeLine = chatMode === 'tutor'
      ? 'Mode PENSER : avance étape par étape. Donne UNE étape, puis pose UNE question de validation.'
      : 'Mode TABLEAU : priorise ce qui est visible sur le tableau.';

    const visionRule = capture
      ? 'RÈGLE: si une capture est présente, elle est la source de vérité. Si conflit avec l\'historique, ignore l\'historique.'
      : undefined;

    return [
      'Tu es « Le Prof Artificiel », un tuteur de mathématiques.',
      `Réponds en ${language}.`,
      modeLine,
      visionRule,
      'Règles:',
      '- Sois bref et direct.',
      '- Ne fais pas le travail à la place de l\'élève.',
      '- Si l\'élève demande une vérification: valide ce qui est juste; si faux, explique pourquoi et donne un indice.',
      'FORMATAGE MATH : LaTeX uniquement ($ ou $$), sans duplication en texte brut.',
      boardSummary,
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
