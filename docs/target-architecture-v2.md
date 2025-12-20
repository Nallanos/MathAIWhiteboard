# Target Architecture v2 (English) — Maintainability Plan

Date: 2025-12-18

This document updates the target architecture decisions:
- **DB migrations**: go all-in on **Drizzle schema-first** + **drizzle-kit generated migrations**.
- **Tutor JSON safety**: introduce **centralized typing + runtime validation** (not “TS-only”).
- **Tutor DB constraints**: choose **(B)** unique `(conversation_id, user_id)`.

---

## 1) DB: Schema-first Drizzle migrations (single source of truth)

### What we have today
- Drizzle schema exists: `apps/backend/src/db/schema.ts`.
- `drizzle-kit` scripts exist in `apps/backend/package.json`:
  - `db:generate`, `db:migrate`, `db:push`, `db:studio`.
- We *also* have runtime SQL migrations in `apps/backend/src/db/migrate.ts` (monolithic schema string).

### Problem
Two sources of truth (schema TS + runtime SQL) → drift risk + hard-to-review DB changes.

### Target
- **Source of truth = TypeScript Drizzle schema** (`src/db/schema.ts`).
- DB changes land via **generated SQL migration files** under `apps/backend/drizzle/`.

### Implementation approach
1) Keep `drizzle.config.ts` as-is (it already points to the schema and `./drizzle`).
2) Stop using runtime schema DDL.
3) Use:
   - `pnpm -C apps/backend db:generate` (generates SQL migration based on schema diffs)
   - `pnpm -C apps/backend db:migrate` (applies migrations)

### Operational note
- In production, run `db:migrate` as a deploy step (CI/CD or entrypoint) rather than “auto-run at runtime in the app process”.

---

## 2) Tutor JSON safety: centralized typing + runtime validation

### Your question: “Isn’t it smarter to integrate centralized typing early?”
Yes — but the key is **runtime validation**. TypeScript alone does not protect you from:
- LLM returning malformed JSON
- DB containing legacy/partial JSON
- API clients sending unexpected shapes

### What we already have
- Centralized TS types in `packages/shared/src/ai.ts`:
  - `TutorPlan`, `TutorPlanStep`, `TutorState`, `TutorPayload`
- Backend uses `zod` already for routes (e.g., `apps/backend/src/routes/*.ts`).
- However, tutor `plan/state` are stored as `jsonb` and read back as `unknown`/`any` (no validation at boundaries).

### Target design (recommended)
**One canonical runtime schema** (Zod) shared by backend + optionally frontend.

#### Option A (best): schemas in `@mathboard/shared`
- Add `packages/shared/src/tutorSchemas.ts` (or extend `ai.ts`) exporting:
  - `TutorPlanSchema`, `TutorStateSchema`, `TutorPayloadSchema`
  - `type TutorPlan = z.infer<typeof TutorPlanSchema>` etc.
- Backend:
  - validate before persisting plan/state
  - validate when reading session from DB
  - safe fallback on invalid JSON (reset session or regenerate plan)
- Frontend:
  - optional validation for resilience (avoid UI crash if backend bug slips)

#### Option B: schemas only in backend
Still good, but less “centralized”. Frontend trusts backend.

### Concrete boundary rules
- **Boundary 1 (LLM → backend)**: parse and validate JSON from model output.
- **Boundary 2 (backend → DB)**: never persist unvalidated `plan/state`.
- **Boundary 3 (DB → API response)**: validate before returning; if invalid:
  - return a safe empty state + a signal to regenerate
  - log structured error with session id

---

## 3) Tutor DB constraint decision: choose (B)

### Decision
- Use **unique `(conversation_id, user_id)`** on `tutoring_sessions`.

### Why
- Supports shared conversations / future multi-user cases.
- Aligns DB constraints with code paths querying by both keys.

### Implications
- Update migration(s) to drop the old unique index on `conversation_id` and create composite unique.
- Update any code assumptions (if any) that “conversation implies user”.

---

## 4) Minimal module boundaries (backend)

Even before a big refactor, keep these boundaries explicit:

```
apps/backend/src/ai/
  history-service.ts       # last-N messages
  prompt-builder.ts        # prompt construction
  providers/*              # gemini/openai/anthropic adapters
  tutor/*                  # session + planner + executor
```

Goal: each change (provider/prompt/tutor logic) touches one small area.

---

## 5) Suggested execution order (low risk)

1) **Tutor DB index change (B)** via drizzle migration.
2) **Tutor runtime validation** (Zod schema) at DB + LLM boundaries.
3) Remove/retire runtime SQL DDL (`apps/backend/src/db/migrate.ts`) and rely on drizzle migrations only.
4) Incrementally split `AiService` into modules.

---

## 6) Definition of done (maintainability)
- DB schema changes are visible as reviewed SQL migrations.
- Tutor sessions never crash UI due to invalid JSON; invalid data self-heals.
- Tutor session uniqueness behavior is enforced by DB constraints.
- Provider/prompt/tutor changes don’t require editing a monolithic file.
