import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, desc, gt, gte } from 'drizzle-orm';
import type { AIPromptPayload, TutorPlan as SharedTutorPlan, TutorState as SharedTutorState, TutorPayload as SharedTutorPayload, LatexDiagnostics as SharedLatexDiagnostics } from '@mathboard/shared';
import { GoogleGenAI, type Content, type Part, type ThinkingConfig } from '@google/genai';
import katex from 'katex';
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
const DEFAULT_DAILY_CREDITS = 5;

const DEFAULT_MAX_OUTPUT_TOKENS = 1536;
const GEMINI_3_MAX_OUTPUT_TOKENS = 3072;

function resolveGeminiThinkingConfig(modelId: string | undefined): ThinkingConfig | undefined {
  const model = (modelId || '').toLowerCase();
  if (!model.startsWith('gemini-3')) return undefined;

  // NOTE: Gemini rejects requests that set BOTH thinkingBudget and thinkingLevel.
  // We support both env vars but only forward one.
  const rawBudgetEnv = String(process.env.GEMINI_THINKING_BUDGET ?? '').trim();
  const rawBudget = Number.parseInt(rawBudgetEnv, 10);
  const hasBudget = rawBudgetEnv.length > 0 && Number.isFinite(rawBudget) && rawBudget > 0;

  const rawLevelEnv = String(process.env.GEMINI_THINKING_LEVEL ?? '').trim();
  const rawLevel = rawLevelEnv.toUpperCase();
  const normalizedLevel = (rawLevel === 'LOW' || rawLevel === 'MEDIUM' || rawLevel === 'HIGH' ? rawLevel : 'HIGH') as any;
  const hasLevel = rawLevelEnv.length > 0;

  if (hasBudget) {
    return {
      // Keep thinking enabled, but avoid it consuming the entire output budget.
      thinkingBudget: rawBudget,
      // Do not expose thoughts to the user.
      includeThoughts: false
    };
  }

  return {
    thinkingLevel: hasLevel ? normalizedLevel : ('HIGH' as any),
    // Do not expose thoughts to the user.
    includeThoughts: false
  };
}

function resolveGeminiMaxOutputTokens(modelId: string | undefined): number {
  const model = (modelId || '').toLowerCase();
  if (model.startsWith('gemini-3')) return GEMINI_3_MAX_OUTPUT_TOKENS;
  return DEFAULT_MAX_OUTPUT_TOKENS;
}

type GeminiUsage = { promptTokens?: number; outputTokens?: number; thoughtTokens?: number; totalTokens?: number };
type GeminiTextResult = { text: string; finishReason?: string; usage?: GeminiUsage; latex?: SharedLatexDiagnostics };

function extractGeminiFinishReason(response: any): string | undefined {
  const reason = response?.candidates?.[0]?.finishReason;
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object' && typeof reason?.name === 'string') return reason.name;
  return undefined;
}

function extractGeminiUsage(response: any): GeminiUsage | undefined {
  const usage = response?.usageMetadata;
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokens = typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : undefined;
  const outputTokens = typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined;
  const thoughtTokens = typeof usage.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : undefined;
  const totalTokens = typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : undefined;
  if (
    promptTokens === undefined &&
    outputTokens === undefined &&
    thoughtTokens === undefined &&
    totalTokens === undefined
  )
    return undefined;
  return { promptTokens, outputTokens, thoughtTokens, totalTokens };
}

function addUsage(a?: GeminiUsage, b?: GeminiUsage): GeminiUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const promptTokens = (a.promptTokens ?? 0) + (b.promptTokens ?? 0);
  const outputTokens = (a.outputTokens ?? 0) + (b.outputTokens ?? 0);
  const thoughtTokens = (a.thoughtTokens ?? 0) + (b.thoughtTokens ?? 0);
  const totalTokens = (a.totalTokens ?? 0) + (b.totalTokens ?? 0);
  return {
    promptTokens: promptTokens || undefined,
    outputTokens: outputTokens || undefined,
    thoughtTokens: thoughtTokens || undefined,
    totalTokens: totalTokens || undefined
  };
}

function shouldContinueGemini(finishReason?: string): boolean {
  const r = (finishReason || '').toUpperCase();
  return r === 'MAX_TOKENS' || r.includes('MAX_TOKENS') || r.includes('MAX');
}

function mergeContinuation(prev: string, next: string): string {
  const a = prev;
  const b = next.trimStart();
  if (!b) return a;

  const maxOverlap = Math.min(400, a.length, b.length);
  for (let len = maxOverlap; len >= 20; len--) {
    const suffix = a.slice(a.length - len);
    const prefix = b.slice(0, len);
    if (suffix === prefix) {
      return a + b.slice(len);
    }
  }

  const sep = a.endsWith('\n') ? '' : '\n';
  return a + sep + b;
}

function isLikelyTruncatedJson(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;

  // Cheap heuristics: if braces/brackets don't match or it doesn't end with a closing brace.
  // This is not a full JSON parser, but good enough to decide whether to ask Gemini to continue.
  const openCurly = (t.match(/\{/g) || []).length;
  const closeCurly = (t.match(/\}/g) || []).length;
  const openSquare = (t.match(/\[/g) || []).length;
  const closeSquare = (t.match(/\]/g) || []).length;

  if (openCurly > closeCurly) return true;
  if (openSquare > closeSquare) return true;
  if (openCurly > 0 && !t.endsWith('}')) return true;
  return false;
}

type LatexSegment = {
  displayMode: boolean;
  content: string;
  raw: string;
  start: number;
  end: number;
};

function normalizeMathDelimitersBackend(input: string): string {
  let text = input ?? '';

  // Convert fenced math/latex blocks to KaTeX-friendly block math.
  // Gemini sometimes emits ```latex ...``` or ```math ...```.
  text = text.replace(/```(?:latex|math)\s*([\s\S]*?)```/gi, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$$\n${body}\n$$` : '';
  });

  // Convert \[ ... \] to $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$$\n${body}\n$$` : '';
  });

  // Convert \( ... \) to $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$${body}$` : '';
  });

  // Wrap standalone LaTeX environments if they appear as plain text on their own line.
  text = text.replace(
    /(^|\n)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(?=\n|$)/g,
    (_m, prefix, env) => `${prefix}$$\n${String(env).trim()}\n$$`
  );

  return text;
}

function escapeUnclosedMathDelimiters(input: string): { text: string; changed: boolean } {
  const text = input ?? '';
  const codeRanges = findFencedCodeBlockRanges(text);
  const isEscaped = (idx: number) => idx > 0 && text[idx - 1] === '\\';

  let inInline = false;
  let inDisplay = false;
  let lastInlinePos = -1;
  let lastDisplayPos = -1;

  let i = 0;
  while (i < text.length) {
    if (isInRanges(i, codeRanges)) {
      const r = codeRanges.find((rr) => i >= rr.start && i < rr.end);
      i = r ? r.end : i + 1;
      continue;
    }

    if (text[i] !== '$' || isEscaped(i)) {
      i++;
      continue;
    }

    const isDouble = text[i + 1] === '$' && !isEscaped(i + 1);
    if (isDouble && !inInline) {
      if (inDisplay) {
        inDisplay = false;
        lastDisplayPos = -1;
      } else {
        inDisplay = true;
        lastDisplayPos = i;
      }
      i += 2;
      continue;
    }

    if (!inDisplay) {
      if (inInline) {
        inInline = false;
        lastInlinePos = -1;
      } else {
        inInline = true;
        lastInlinePos = i;
      }
    }
    i += 1;
  }

  if (!inInline && !inDisplay) return { text, changed: false };

  // Safety-first: if a math delimiter is left open, we escape the opening delimiter
  // so it becomes literal text instead of swallowing the remainder.
  let out = text;
  let changed = false;

  if (inDisplay && lastDisplayPos >= 0) {
    out = out.slice(0, lastDisplayPos) + '\\$\\$' + out.slice(lastDisplayPos + 2);
    changed = true;
  }
  if (inInline && lastInlinePos >= 0) {
    out = out.slice(0, lastInlinePos) + '\\$' + out.slice(lastInlinePos + 1);
    changed = true;
  }

  return { text: out, changed };
}

function findFencedCodeBlockRanges(input: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const re = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInRanges(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true;
  }
  return false;
}

function extractLatexSegments(input: string): { segments: LatexSegment[]; hasUnclosed: boolean } {
  const text = input ?? '';
  const codeRanges = findFencedCodeBlockRanges(text);
  const segments: LatexSegment[] = [];
  let hasUnclosed = false;

  const isEscaped = (idx: number) => idx > 0 && text[idx - 1] === '\\';

  let i = 0;
  while (i < text.length) {
    if (isInRanges(i, codeRanges)) {
      const r = codeRanges.find((rr) => i >= rr.start && i < rr.end);
      i = r ? r.end : i + 1;
      continue;
    }

    if (text[i] !== '$' || isEscaped(i)) {
      i++;
      continue;
    }

    const isDisplay = text[i + 1] === '$' && !isEscaped(i + 1);
    const openLen = isDisplay ? 2 : 1;
    const openStart = i;
    const contentStart = i + openLen;

    let j = contentStart;
    let found = false;
    while (j < text.length) {
      if (isInRanges(j, codeRanges)) {
        const r = codeRanges.find((rr) => j >= rr.start && j < rr.end);
        j = r ? r.end : j + 1;
        continue;
      }

      if (text[j] !== '$' || isEscaped(j)) {
        j++;
        continue;
      }

      if (isDisplay) {
        if (text[j + 1] === '$' && !isEscaped(j + 1)) {
          const content = text.slice(contentStart, j);
          const raw = text.slice(openStart, j + 2);
          segments.push({ displayMode: true, content, raw, start: openStart, end: j + 2 });
          i = j + 2;
          found = true;
          break;
        }
        j++;
        continue;
      }

      // inline: $...$ but avoid $$
      if (text[j + 1] === '$' && !isEscaped(j + 1)) {
        // it's $$, not an inline closer
        j += 2;
        continue;
      }

      const content = text.slice(contentStart, j);
      const raw = text.slice(openStart, j + 1);
      segments.push({ displayMode: false, content, raw, start: openStart, end: j + 1 });
      i = j + 1;
      found = true;
      break;
    }

    if (!found) {
      hasUnclosed = true;
      break;
    }
  }

  return { segments, hasUnclosed };
}

function validateLatexWithKatex(input: string): {
  ok: boolean;
  hardFail: boolean;
  errors: Array<{ raw: string; error: string }>;
} {
  const { segments, hasUnclosed } = extractLatexSegments(input);
  const errors: Array<{ raw: string; error: string }> = [];

  if (hasUnclosed) {
    errors.push({ raw: '$…', error: 'Unclosed $ or $$ delimiter' });
  }

  // Validate up to a reasonable number of segments to avoid worst-case latency.
  for (const seg of segments.slice(0, 30)) {
    const content = (seg.content ?? '').trim();
    if (!content) continue;
    try {
      katex.renderToString(content, {
        throwOnError: true,
        displayMode: seg.displayMode,
        strict: 'warn'
      });
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'KaTeX render error';
      errors.push({ raw: seg.raw.slice(0, 400), error: msg });
      if (errors.length >= 6) break;
    }
  }

  return { ok: errors.length === 0, hardFail: Boolean(hasUnclosed), errors };
}

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
  finishReason?: string;
  latex?: SharedLatexDiagnostics;
  usage?: {
    promptTokens?: number;
    outputTokens?: number;
    thoughtTokens?: number;
    totalTokens?: number;
  };
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
  private readonly genAI: GoogleGenAI;
  private readonly openai?: OpenAI;
  private readonly anthropic?: Anthropic;
  private readonly geminiKey: string;

  private googleModelsCache:
    | { expiresAt: number; models: Set<string> }
    | null = null;

  constructor({ db, geminiKey, openaiKey, anthropicKey }: AiServiceDeps) {
    this.db = db;
    this.geminiKey = geminiKey;
    this.genAI = new GoogleGenAI({ apiKey: geminiKey });

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
        try {
          const result = await this.analyzeTutor(payload, userId, capture, model, history);
          return {
            status: 'completed',
            message: result.message,
            provider: 'google',
            model,
            strategy: wantsVision ? 'vision' : 'text',
            captureId: payload.captureId,
            tutor: result.tutor,
            aiCreditsRemaining,
            latex: result.latex
          };
        } catch (err) {
          // Tutor mode relies on strict JSON for the plan; Gemini can sometimes return truncated JSON.
          // Don't fail the whole request with a 502: return a user-facing message instead.
          console.error('Tutor analysis failed:', err);
          return {
            status: 'completed',
            message:
              "Le mode tuteur a eu un souci pour générer le plan (JSON incomplet). Réessaie, ou reformule plus court. Si ça persiste, passe en mode tableau.",
            provider: 'google',
            model,
            strategy: wantsVision ? 'vision' : 'text',
            captureId: payload.captureId,
            tutor: undefined,
            aiCreditsRemaining
          };
        }
      }

      let message = '';
      let finishReason: string | undefined;
      let usage: GeminiUsage | undefined;
      let latex: SharedLatexDiagnostics | undefined;
      if (provider === 'openai' && this.openai) {
        message = await this.generateWithOpenAI(payload, chatMode, capture, history, model);
      } else if (provider === 'anthropic' && this.anthropic) {
        message = await this.generateWithAnthropic(payload, chatMode, capture, history, model);
      } else {
        // Default to Gemini
        const gemini = await this.generateWithGemini(payload, chatMode, capture, history, model);
        message = gemini.text;
        finishReason = gemini.finishReason;
        usage = gemini.usage;
        latex = gemini.latex;
      }

      return {
        status: 'completed',
        message,
        provider,
        model,
        strategy: wantsVision ? 'vision' : 'text',
        captureId: payload.captureId,
        aiCreditsRemaining,
        finishReason,
        usage,
        latex
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

  private inferImageMimeTypeFromPath(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/png';
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
  ): Promise<{ message: string; tutor: SharedTutorPayload; latex?: SharedLatexDiagnostics }> {
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
    const step = await this.generateTutorStepWithGemini(payload, capture, effectivePlan, state, currentStepId, currentStep, model, history);

    return {
      message: step.text,
      tutor: { plan: effectivePlan, state: { ...state, currentStepId } },
      latex: step.latex
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
    // Plans are short, but JSON mode can still be truncated; allow a slightly larger budget.
    const baseMaxOutputTokens = resolveGeminiMaxOutputTokens(model);
    const maxOutputTokens = Math.max(baseMaxOutputTokens, model?.toLowerCase?.().startsWith('gemini-3') ? 3072 : baseMaxOutputTokens);
    const config: any = {
      temperature: 0.2,
      maxOutputTokens,
      topP: 0.9,
      responseMimeType: 'application/json'
    };
    const thinkingConfig = resolveGeminiThinkingConfig(model || DEFAULT_VISION_MODEL);
    if (thinkingConfig) config.thinkingConfig = thinkingConfig;

    const parts: Part[] = [];
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: this.inferImageMimeTypeFromPath(capture.imageUrl)
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

    const baseContents: Content[] = [
      {
        role: 'user',
        parts
      }
    ];

    const parsePlan = (candidateText: string): SharedTutorPlan => {
      const raw = this.extractJsonObject(candidateText);
      const parsed = JSON.parse(raw);
      const validated = safeParseTutorPlan(parsed);
      if (!validated.ok) throw new Error(`Tutor plan JSON invalid: ${validated.error}`);
      return validated.plan as unknown as SharedTutorPlan;
    };

    const response = await this.genAI.models.generateContent({
      model: model || DEFAULT_VISION_MODEL,
      contents: baseContents,
      config
    });
    let text: string = (response.text ?? '').trim();
    if (!text) throw new Error('Empty plan response');

    let finishReason = extractGeminiFinishReason(response);

    try {
      return parsePlan(text);
    } catch (e) {
      // If the JSON looks truncated, attempt a continuation.
    }

    const MAX_JSON_CONTINUATIONS = 2;
    for (let i = 0; i < MAX_JSON_CONTINUATIONS && (shouldContinueGemini(finishReason) || isLikelyTruncatedJson(text)); i++) {
      const continuationContents: Content[] = [
        ...baseContents,
        { role: 'model', parts: [{ text }] },
        {
          role: 'user',
          parts: [
            {
              text:
                "Continue exactement où tu t'es arrêté et termine le JSON. Important: retourne UNIQUEMENT du JSON valide (aucun markdown, aucune explication, pas de ```). Ne répète pas le début."
            }
          ]
        }
      ];

      const cont = await this.genAI.models.generateContent({
        model: model || DEFAULT_VISION_MODEL,
        contents: continuationContents,
        config
      });
      const contText: string = (cont.text ?? '').trim();
      if (!contText) break;

      text = mergeContinuation(text, contText);
      finishReason = extractGeminiFinishReason(cont);

      try {
        return parsePlan(text);
      } catch (e) {
        // keep looping
      }
    }

    // Final fallback: one full retry with stricter instruction.
    const retryInstruction = instruction +
      "\n\nRAPPEL CRITIQUE: Tu dois retourner un JSON PARSEABLE. Aucun texte hors JSON. Vérifie que toutes les accolades/chevrons sont fermées.";
    const retryParts: Part[] = [];
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      retryParts.push({
        inlineData: {
          data: base64Image,
          mimeType: this.inferImageMimeTypeFromPath(capture.imageUrl)
        }
      });
    }
    retryParts.push({ text: retryInstruction });

    const retry = await this.genAI.models.generateContent({
      model: model || DEFAULT_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: retryParts
        }
      ],
      config
    });
    const retryText = (retry.text ?? '').trim();
    if (!retryText) throw new Error('Empty plan response (retry)');

    return parsePlan(String(retryText).trim());
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
  ): Promise<{ text: string; latex: SharedLatexDiagnostics }> {
    const maxOutputTokens = resolveGeminiMaxOutputTokens(model);
    const config: any = {
      temperature: 0.2,
      maxOutputTokens,
      topP: 0.9
    };
    const thinkingConfig = resolveGeminiThinkingConfig(model || DEFAULT_VISION_MODEL);
    if (thinkingConfig) config.thinkingConfig = thinkingConfig;

    const parts: Part[] = [];
    if (capture) {
      const base64Image = await this.readImageAsBase64(capture.imageUrl);
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: this.inferImageMimeTypeFromPath(capture.imageUrl)
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

    const result = await this.genAI.models.generateContent({
      model: model || DEFAULT_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      config
    });

    const text = (result.text ?? '').trim();
    if (!text) throw new Error('Empty tutor step response');

    let cleaned = this.cleanResponse(text);
    const repaired = await this.validateAndRepairLatexIfNeeded(cleaned, model);
    return repaired;
  }

  private async generateWithGemini(
    payload: AIPromptPayload,
    chatMode: 'board' | 'tutor',
    capture: CaptureRecord | null,
    history: { role: string; content: string }[],
    model: string
  ): Promise<GeminiTextResult> {
    const maxOutputTokens = resolveGeminiMaxOutputTokens(model);
    const config: any = {
      temperature: 0.2,
      maxOutputTokens,
      topP: 0.9
    };
    const thinkingConfig = resolveGeminiThinkingConfig(model || DEFAULT_VISION_MODEL);
    if (thinkingConfig) config.thinkingConfig = thinkingConfig;

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
          mimeType: this.inferImageMimeTypeFromPath(capture.imageUrl)
        }
      });
    }

    currentParts.push({ text: this.buildSystemPrompt(payload.locale, chatMode, capture, payload.boardVersion) });
    currentParts.push({ text: `Demande de l'élève: ${payload.prompt}` });

    contents.push({
      role: 'user',
      parts: currentParts
    });

    const result = await this.genAI.models.generateContent({
      model: model || DEFAULT_VISION_MODEL,
      contents,
      config
    });

    let text: string = (result.text ?? '').trim();
    if (!text) throw new Error('Empty response from Gemini');

    let finishReason = extractGeminiFinishReason(result);
    let usage = extractGeminiUsage(result);

    // Auto-continue only when Gemini explicitly stopped due to max tokens.
    // This prevents cut-in-the-middle responses (markdown bullets, bold, etc.).
    const MAX_CONTINUATIONS = 1;
    for (let i = 0; i < MAX_CONTINUATIONS && shouldContinueGemini(finishReason); i++) {
      const continuationContents: Content[] = [
        ...contents,
        { role: 'model', parts: [{ text }] },
        {
          role: 'user',
          parts: [
            {
              text:
                "Continue exactement où tu t'es arrêté. Ne répète pas. Garde le même formatage (Markdown + LaTeX $/$$)."
            }
          ]
        }
      ];

      const cont = await this.genAI.models.generateContent({
        model: model || DEFAULT_VISION_MODEL,
        contents: continuationContents,
        config
      });
      const contText: string = (cont.text ?? '').trim();
      if (!contText) break;

      text = mergeContinuation(text, contText);
      finishReason = extractGeminiFinishReason(cont);
      usage = addUsage(usage, extractGeminiUsage(cont));
    }

    let cleaned = this.cleanResponse(text);
    const repaired = await this.validateAndRepairLatexIfNeeded(cleaned, model);
    return { text: repaired.text, finishReason, usage, latex: repaired.latex };
  }

  private async validateAndRepairLatexIfNeeded(
    text: string,
    model: string
  ): Promise<{ text: string; latex: SharedLatexDiagnostics }> {
    const original = text;

    // 1) Deterministic normalization (mirrors the frontend) to reduce repair calls.
    let normalized = normalizeMathDelimitersBackend(original);
    // Keep existing cleanup too.
    normalized = this.cleanResponse(normalized);

    // 2) Safe-ish local fix: if a $/$$ delimiter is left open, escape it.
    const escaped = escapeUnclosedMathDelimiters(normalized);
    if (escaped.changed) normalized = escaped.text;

    const validation = validateLatexWithKatex(normalized);
    if (validation.ok) {
      return {
        text: normalized,
        latex: {
          ok: true,
          errorCount: 0,
          hardFail: false,
          repairedAttempted: false,
          repairedOk: false
        }
      };
    }

    // Only attempt LLM repair on hard failures (delimiter issues).
    if (!validation.hardFail) {
      return {
        text: normalized,
        latex: {
          ok: false,
          errorCount: validation.errors.length,
          hardFail: false,
          repairedAttempted: false,
          repairedOk: false
        }
      };
    }

    // 3) One-shot repair pass. Use the free default model to avoid consuming extra user credits.
    // Guardrail: skip repair if input is too large.
    const MAX_REPAIR_INPUT_CHARS = 8000;
    if (normalized.length > MAX_REPAIR_INPUT_CHARS) {
      return {
        text: normalized,
        latex: {
          ok: false,
          errorCount: validation.errors.length,
          hardFail: true,
          repairedAttempted: false,
          repairedOk: false
        }
      };
    }

    const repairModelId = DEFAULT_VISION_MODEL;
    const repairConfig: any = {
      temperature: 0.0,
      maxOutputTokens: Math.max(resolveGeminiMaxOutputTokens(repairModelId), 1536),
      topP: 0.9
    };

    const errorList = validation.errors
      .slice(0, 6)
      .map((e, idx) => `${idx + 1}) ${e.error}\nFRAGMENT: ${e.raw}`)
      .join('\n\n');

    const prompt = [
      'Tu vas corriger UNIQUEMENT des erreurs de syntaxe LaTeX dans le texte suivant.',
      'Contraintes STRICTES:',
      "- Ne change pas le contenu mathématique ni le sens des phrases.",
      "- Ne reformule pas, ne rajoute rien, ne supprime rien sauf si nécessaire pour réparer le LaTeX.",
      "- Répare les délimiteurs $...$ et $$...$$ (ouvrir/fermer correctement).",
      "- Répare les environnements \\begin{...} / \\end{...} si nécessaire (appariement).",
      "- Ne transforme pas les maths en blocs de code et n'ajoute aucun ```.",
      '',
      'Erreurs détectées par KaTeX:',
      errorList || '(aucune précision)',
      '',
      'TEXTE ORIGINAL (copie exacte) :',
      normalized,
      '',
      'Rends UNIQUEMENT le texte corrigé (même contenu, LaTeX corrigé).'
    ].join('\n');

    const res = await this.genAI.models.generateContent({
      model: repairModelId,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: repairConfig
    });

    const repairedRaw = (res.text ?? '').trim();
    if (!repairedRaw) {
      return {
        text: normalized,
        latex: {
          ok: false,
          errorCount: validation.errors.length,
          hardFail: true,
          repairedAttempted: true,
          repairedOk: false
        }
      };
    }

    let repaired = this.cleanResponse(repairedRaw);
    repaired = normalizeMathDelimitersBackend(repaired);
    const escaped2 = escapeUnclosedMathDelimiters(repaired);
    if (escaped2.changed) repaired = escaped2.text;

    const validation2 = validateLatexWithKatex(repaired);
    if (!validation2.ok) {
      console.warn('KaTeX validation still failing after repair pass:', validation2.errors);
      // Critical rule: never return a repaired text that is still invalid.
      return {
        text: normalized,
        latex: {
          ok: false,
          errorCount: validation2.errors.length,
          hardFail: validation2.hardFail,
          repairedAttempted: true,
          repairedOk: false
        }
      };
    }

    return {
      text: repaired,
      latex: {
        ok: true,
        errorCount: 0,
        hardFail: false,
        repairedAttempted: true,
        repairedOk: true
      }
    };
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

    const styleRules = locale === 'en'
      ? [
          'Style:',
          '- Be concise, but include enough detail to understand the why.',
          '- Prefer short paragraphs over complex nesting (no deep lists).',
          '- Avoid blockquotes and avoid mixing bullets with quoted instructions.',
        ].join('\n')
      : [
          'Style:',
          '- Sois concis, mais assez détaillé pour comprendre le pourquoi.',
          '- Préfère 1–3 petits paragraphes plutôt que des listes imbriquées.',
          '- Évite les citations (>) et évite de mélanger instructions et exemples.',
        ].join('\n');

    const latexRules = locale === 'en'
      ? [
          'Math formatting (strict):',
          '- Use ONLY LaTeX with $...$ (inline) and $$...$$ (block).',
          '- Never wrap math in code blocks, never use ```latex or ```math.',
          '- Do not use backticks around formulas.',
          '- Always close $ / $$ delimiters; do not leave unfinished environments.',
        ].join('\n')
      : [
          'FORMATAGE MATH (strict):',
          '- Utilise UNIQUEMENT LaTeX avec $...$ (inline) et $$...$$ (bloc).',
          '- N\'entoure jamais les maths avec des blocs de code; n\'utilise jamais ```latex / ```math.',
          '- Ne mets pas de backticks autour des formules.',
          '- Ferme toujours les délimiteurs $ / $$; ne laisse pas d\'environnement incomplet.',
        ].join('\n');

    return [
      'Tu es « Le Prof Artificiel », un tuteur de mathématiques.',
      `Réponds en ${language}.`,
      modeLine,
      visionRule,
      styleRules,
      'Règles:',
      '- Ne fais pas le travail à la place de l\'élève.',
      '- Si l\'élève demande une vérification: valide ce qui est juste; si faux, explique pourquoi (brièvement) et donne un indice.',
      latexRules,
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
