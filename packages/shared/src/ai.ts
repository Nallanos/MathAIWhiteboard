export type AIMode = 'auto' | 'manual';

export type ChatMode = 'board' | 'tutor';

export type TutorHintPolicy = 'dont_give_full_solution' | 'guided' | 'direct';

export interface TutorPlanStep {
  id: string;
  title: string;
  success_criteria: string[];
  hint_policy: TutorHintPolicy;
}

export interface TutorPlan {
  goal: string;
  prerequisites: string[];
  common_mistakes: string[];
  steps: TutorPlanStep[];
}

export interface TutorState {
  currentStepId: string | null;
  completedStepIds: string[];
}

export interface TutorPayload {
  plan: TutorPlan;
  state: TutorState;
}

export interface AIMessage {
  id: string;
  boardId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface SceneSnapshot {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface CaptureImagePayload {
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface CreateCapturePayload {
  conversationId: string;
  boardId: string;
  scene: SceneSnapshot;
  image: CaptureImagePayload;
}

export interface AIPromptPayload {
  boardId: string;
  conversationId: string;
  prompt: string;
  locale: 'fr' | 'en';
  mode: AIMode;
  captureId: string | null;
  chatMode?: ChatMode;
  boardVersion?: number;
  provider?: 'google' | 'openai' | 'anthropic';
  model?: string;
}

export interface LatexDiagnostics {
  ok: boolean;
  errorCount: number;
  hardFail: boolean;
  repairedAttempted: boolean;
  repairedOk: boolean;
}

export interface AIAnalyzeResponse {
  status: 'completed';
  message: string;
  provider: string;
  model: string;
  strategy: 'vision' | 'text';
  captureId?: string | null;
  tutor?: TutorPayload;
  aiCreditsRemaining?: number;
  finishReason?: string;
  latex?: LatexDiagnostics;
  usage?: {
    promptTokens?: number;
    outputTokens?: number;
    thoughtTokens?: number;
    totalTokens?: number;
  };
}
