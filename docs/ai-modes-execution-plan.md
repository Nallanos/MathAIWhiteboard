# AI Chat Modes — Execution Plan

Date: 2025-12-12

## 0) Goal
Add 2 explicit chat modes in the web chat UI and route each mode to the right backend pipeline:

1) **Lecture tableau** (default): uses the current capture-based context (scene + PNG) and is optimized for “what’s on the board now”.
2) **Exercice long (Penser)**: creates a structured plan (todos) + step-by-step tutoring state machine persisted in DB.

Also: clearly explain to users how/when to use each mode.

## 1) Current baseline (what exists)
**Web**
- Capture snapshot is built in `apps/web/src/lib/capture.ts` and uploaded to `POST /api/captures` from `apps/web/src/hooks/useAI.ts`.
- Chat prompts go to `POST /api/ai/analyze` (`apps/web/src/hooks/useAI.ts`).
- History is stored in DB via `POST /api/messages` and loaded with `GET /api/conversations/:id/messages`.

**Backend**
- `POST /api/captures` persists `scene` (JSON) + stores `png` on disk (`CaptureService.save`).
- `POST /api/ai/analyze` calls `AiService.analyze(payload)` (`apps/backend/src/routes/ai.ts`).
- `AiService.analyze()` currently loads:
  - capture (if `captureId` provided)
  - last messages for `conversationId`
  - then calls provider (Google/OpenAI/Anthropic). Today you run Google-only.

## 2) Product copy (how users should use modes)
Add a compact helper text under the selector (2–3 lines) + a “?” tooltip / small link to a longer help section.

### Lecture tableau (default)
**Use when:** “Lis ce que j’ai écrit”, “explique ce schéma”, “corrige ce calcul sur le tableau”.
**What it does:** sends a snapshot of the board (image + scene) with your question.
**Tip:** write your work on the board; then ask.

### Exercice long (Penser)
**Use when:** multi-step exercise, you want guidance and checkpoints.
**What it does:** creates a plan (todos) and helps step-by-step. You (the student) validate each step.
**Tip:** answer briefly to the assistant’s checkpoint question.

## 3) Shared contract changes (packages/shared)
File: `packages/shared/src/ai.ts`

### Add chat mode
```ts
export type ChatMode = 'board' | 'tutor';
```

### Extend payload (non-breaking)
```ts
export interface AIPromptPayload {
  // existing fields...
  chatMode?: ChatMode; // default 'board'
}
```

Notes:
- Keep existing `mode: 'auto'|'manual'` as **captureMode** for now (rename later if desired).

## 4) Web UI changes (apps/web)
### 4.1 Mode selector
- Add a 3-option selector in `apps/web/src/components/AISidebar/index.tsx` header area.
- Persist selection in local state (and optionally `localStorage` later).

### 4.2 Hook changes
File: `apps/web/src/hooks/useAI.ts`

- Add `chatMode` to the hook options and to the payload sent to `/api/ai/analyze`.
- Behavior per mode:
  - `board`: current behavior (upload capture, send `captureId`).
  - `tutor`: upload capture (recommended) + send `chatMode: 'tutor'`.

### 4.3 User explanation
- Add 2–3 lines below selector (see section 2).
- Keep it short and always visible.

## 5) Backend routing changes (apps/backend)
File: `apps/backend/src/routes/ai.ts`

- Extend the Zod schema with:
```ts
chatMode: z.enum(['board', 'tutor']).default('board')
```
- Pass through to `AiService.analyze` via `AIPromptPayload`.

## 6) Backend pipeline design (AiService)
File: `apps/backend/src/services/ai-service.ts`

### 6.1 Mode: board (Lecture tableau)
Goals: vision-first, prevent history “pollution”.

Implementation rules:
- If `captureId` exists:
  - reduce history window (e.g. last 6 messages) OR none if prompt intent is “read what’s on the board”.
  - system prompt must be short and explicit: capture is source-of-truth.
  - put image first in multimodal content.
- If no `captureId`:
  - treat as normal chat but avoid huge history (still cap).

### 6.2 Mode: tutor (Exercice long / Penser)
Goals: structured plan + step-by-step execution with persisted state.

Pipeline (server-side orchestration):
1) **Turn classifier** (cheap): classify prompt into one of:
   - `needs_diagnostic` (ask 1–3 questions)
   - `plan_needed`
   - `continue_step`
   - `fallback_quick`
   - `fallback_board`

2) **Diagnostic** (max 1–3 questions): only if missing info.

3) **Planner**: generate a strict JSON plan.

4) **Executor**: produce only the current step + one checkpoint question.

5) **State updates**: update DB session state.

## 7) DB persistence (Drizzle / Postgres)
Add two tables (minimal schema):

### 7.1 `student_profiles`
Keyed by `userId`.
- `id` (uuid)
- `userId` (uuid, unique)
- `locale`
- `mastery` (jsonb) — skills + confidence
- `preferences` (jsonb) — style preferences
- timestamps

### 7.2 `tutoring_sessions`
Keyed by `conversationId` (1 active session per conversation).
- `id` (uuid)
- `conversationId` (uuid, unique)
- `boardId` (text)
- `userId` (uuid)
- `status` enum: `active | completed | abandoned`
- `plan` (jsonb) — the todos plan
- `state` (jsonb) — `current_step_id`, evidence, last_question, etc.
- `createdAt`, `updatedAt`, `completedAt`

Rollup strategy:
- When session completes, keep only a compact `mastery_updates` merged into `student_profiles`; optionally delete `plan/state` after N days.

## 8) JSON contracts (planner/executor)
### 8.1 Planner output schema (strict JSON)
```json
{
  "goal": "string",
  "prerequisites": ["string"],
  "common_mistakes": ["string"],
  "steps": [
    {
      "id": "step_1",
      "title": "string",
      "success_criteria": ["string"],
      "hint_policy": "dont_give_full_solution|guided|direct"
    }
  ]
}
```

### 8.2 Executor output
- Chat answer (markdown) must contain:
  - current step title
  - the smallest next action
  - exactly one checkpoint question

## 9) Optional Phase (future): “Cours long” viewer
This is feasible, but should be a **separate feature flag** after the 3 modes work.

MVP implementation:
- Generate **Markdown** (not PDF) with KaTeX math.
- Store as `ai_documents` table:
  - `id`, `userId`, `boardId`, `conversationId`, `title`, `markdown`, `createdAt`
- Chat message includes a small “card” + link to open a viewer (panel/overlay) rendering markdown.

Rationale:
- Markdown viewer is cheaper + faster than PDF.
- PDF export can be added later if needed.

## 10) Rollout plan
1) Add `chatMode` to shared types + backend Zod + client payload.
2) Add mode selector in `AISidebar` + wire into `useAI`.
3) Implement tutoring DB tables + minimal `tutor` pipeline (diagnostic → planner → executor).
4) Add help copy + adjust empty state text.
5) Add observability: log `chatMode`, latency, tokens, completion rate.

## 11) Acceptance criteria
- **Board mode**: when user asks “lis ce que j’ai écrit”, the answer references the board content (not chat history).
- **Tutor mode**: first message either asks ≤3 diagnostic questions or creates a todos plan; subsequent turns continue the current step.
- All modes persist messages as before.

