# Target Architecture (minimal) — IA + Tutor

Date: 2025-12-18

Objectif: réduire la dette et rendre l’IA/tutor **facile à faire évoluer** (nouveaux providers, règles, UI) sans régressions.

---

## 1) Problèmes → Solutions (concrètes)

### P0 — Migrations DB dupliquées (drift)
**Problème**: `apps/backend/src/db/migrate.ts` (SQL runtime) + `apps/backend/src/db/schema.ts` (Drizzle) = 2 sources de vérité.

**Solution cible**:
- Source de vérité unique: **migrations versionnées** (Drizzle migrations) OU, si vous voulez garder du runtime:
  - générer le SQL à partir du schéma (ou l’inverse) et interdire les edits manuels du doublon.
- Ajout d’un `schema_version` et d’un système “apply once” (idempotent mais versionné) si runtime conservé.

**Livrable**:
- `apps/backend/src/db/migrations/*` + runner
- supprimer le gros SQL monolithique à terme.

---

### P0 — Historique chargé à l’envers (qualité IA + debug)
**Problème**: l’historique est trié `asc` puis `limit(n)` → vous prenez les **plus vieux** messages.

**Solution cible**:
- Charger les **N derniers**: `orderBy desc` + `limit(n)` puis reverse côté code pour garder l’ordre chronologique.
- Encapsuler dans `HistoryService.getRecent(conversationId, n)`.

---

### P0 — `AiService` monolithe (régressions probables)
**Problème**: un fichier gère orchestration + prompts + providers + tutor state machine.

**Solution cible**: découpage en modules purs + orchestrateur mince.

Proposition de layout:
```
apps/backend/src/ai/
  index.ts                 # wires deps
  ai-orchestrator.ts       # décide: board vs tutor
  history-service.ts
  prompt/
    prompt-builder.ts      # buildSystemPrompt + context assembly
    prompt-policies.ts     # heuristiques (vision-first, ignore history, etc.)
  providers/
    provider.ts            # interface
    gemini.ts
    openai.ts
    anthropic.ts
  tutor/
    tutor-service.ts       # get/create session + plan/state transitions
    tutor-planner.ts       # JSON plan generation + validation
    tutor-executor.ts      # current-step response generation
    tutor-schemas.ts       # zod: plan/state
```

**Règle**: chaque module a une responsabilité, et les prompts/heuristiques sont testables en isolation.

---

### P0 — JSON tutor non validé (poisoning)
**Problème**: `plan/state` en `jsonb` avec `as any` → une valeur invalide casse le front.

**Solution cible**:
- Zod schemas uniques (backend) pour `TutorPlan` et `TutorState`.
- À l’écriture: valider et refuser/normaliser.
- À la lecture: si invalide → fallback safe (session reset ou plan régénéré) + log.

---

### P1 — Gestion erreurs côté client (persistance incohérente)
**Problème**: `useAI` ne vérifie pas `response.ok` sur `/api/ai/analyze`.

**Solution cible**:
- Un seul wrapper `apiFetchJson<T>()` qui:
  - check `ok`,
  - renvoie `{data}` ou `{error}` typed,
  - gère `401`/`403`.
- Ne persister un message assistant que si l’appel IA réussit.

---

### P1 — Typage Express / auth (ts-ignore)
**Problème**: `req.user` parfois via `ts-ignore`.

**Solution cible**:
- Standardiser `AuthenticatedRequest` et l’utiliser dans toutes les routes auth.
- Option: middleware `requireUser(req): user`.

---

### P1 — Contraintes DB tutor pas totalement alignées
**Problème**: index unique sur `conversation_id` mais requêtes par `(conversationId, userId)`.

**Solution cible** (choisir 1):
- (A) Si conversation est strictement user-scopée: simplifier requêtes et garder unique `conversation_id`.
- (B) Si conversation peut être partagée: unique `(conversation_id, user_id)` + ajuster queries.

---

### P2 — Rétention captures (coût stockage)
**Problème**: accumulation PNG + scene JSON.

**Solution cible**:
- Politique de rétention: garder N captures / conversation ou max âge.
- Job de purge (cron/worker) + endpoint admin.

---

### P2 — Observabilité (pilotage)
**Solution cible**:
- Logs structurés par requête IA: `conversationId`, `chatMode`, `provider`, `model`, `strategy`, `historyLimit`, `captureBytes`, `latencyMs`, `errorCode`.
- Compteurs: taux d’échec capture/IA, temps moyen, taille moyenne capture.

---

## 2) Contrats et boundaries

### API backend (cible)
- `POST /api/ai/analyze`
  - input: `AIPromptPayload`
  - output: `AIAnalyzeResponse`
- `GET/PATCH /api/tutor/conversations/:id/session`
  - input patch: `{completedStepIds?, currentStepId?, status?}`
  - output: session avec `plan/state` validés.

### Invariants
- `board`:
  - capture obligatoire (bloquant) et **vision-first**.
- `tutor`:
  - capture obligatoire (bloquant),
  - réponses étape-par-étape, état persistant.

---

## 3) Plan de migration incrémental (sans gros refactor)

### Étape 1 (quick wins)
- Fix history: prendre les derniers messages.
- Ajouter `response.ok` + erreurs UI.
- Ajouter Zod validation tutor (read/write).

### Étape 2 (découpage)
- Extraire `PromptBuilder` + `HistoryService`.
- Extraire `providers/*` derrière une interface.
- Extraire `TutorService` (session + planner + executor).

### Étape 3 (DB)
- Mettre en place migrations versionnées.
- Ajouter rétention captures.

---

## 4) Définition de “maintenable” (checklist)
- Ajouter un provider = 1 fichier `providers/x.ts` + 0 changement ailleurs.
- Changer une règle prompt = 1 endroit (`prompt-policies.ts`) + tests.
- Un JSON tutor invalide ne casse jamais le front.
- DB schema évolue via migrations versionnées, pas via un gros SQL unique.
