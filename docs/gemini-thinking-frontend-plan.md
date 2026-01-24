# AI Streaming + “Thinking UI” — Plan d’implémentation

Date: 2026-01-24

Ce document remplace l’ancien plan “thinking only” en ajoutant:
1) une UI qui rend visible le **process** (stages/progrès) sans exposer le chain-of-thought,
2) le **streaming temps réel** de la génération LLM jusqu’au client.

## 0) Objectifs
### 0.1 Streaming
- Afficher le texte de l’assistant **au fil de l’eau** pendant la génération.
- Supporter l’annulation (Abort) côté client.
- Garder la persistance en DB: message final enregistré comme aujourd’hui.

### 0.2 Thinking UI (sans chain-of-thought)
- Afficher un indicateur “Thinking…” + étapes (ex: “Analyse”, “Rédaction”, “Vérification LaTeX”, “Terminé”).
- Ne jamais afficher les “thoughts” (raisonnement interne). On expose seulement des **signaux** et du texte final.

### 0.3 Contrôle du niveau de thinking
- Permettre au user de choisir un mode thinking (Auto/Low/Medium/High ou Budget).
- Appliquer uniquement à Gemini 3+.
- Ne jamais envoyer `thinkingBudget` ET `thinkingLevel` à la fois.

## 1) Contraintes & garde-fous (sécurité/qualité)
- `includeThoughts: false` reste **forcé** côté backend.
- Le backend clamp toute valeur client (budget min/max, level whitelist).
- Streaming via SSE par défaut (simple et robuste avec `fetch`).
- Fallback: si streaming indispo, utiliser le endpoint non-streaming existant.

## 2) Architecture proposée

### 2.1 Nouveau endpoint streaming
Ajouter un endpoint SSE:

- `POST /api/ai/analyze/stream`
  - Auth identique à `/api/ai/analyze`
  - Reçoit le même payload + options thinking
  - Répond en `text/event-stream`

### 2.2 Protocol SSE (events)
On envoie des events JSON, chacun sur une ligne `data:` (format SSE standard).

Types d’events recommandés:
```ts
type AiStreamEvent =
  | { type: 'status'; stage: 'capture'|'context'|'model'|'latex'|'persist'|'done'; message?: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage?: { promptTokens?: number; outputTokens?: number; thoughtTokens?: number; totalTokens?: number } }
  | { type: 'credits'; remaining?: number }
  | { type: 'error'; error: string }
  | { type: 'done'; messageId?: string; model: string; provider: string };
```

Notes:
- `status.stage` sert à la UI “process”.
- `delta.text` ne contient que le texte “visible” de l’assistant.
- `usage` optionnel (si provider le donne).

### 2.3 Annulation
Frontend: `AbortController` sur le `fetch`.
Backend: détecter `req.on('close')` et arrêter la boucle streaming.

## 3) Contrat shared
Fichier: packages/shared/src/ai.ts

### 3.1 Payload thinking (non-breaking)
```ts
export type ThinkingLevel = 'low' | 'medium' | 'high';

export type ThinkingConfig =
  | { mode: 'auto' }
  | { mode: 'level'; level: ThinkingLevel }
  | { mode: 'budget'; budget: number };

export interface AIPromptPayload {
  // ...existing
  thinking?: ThinkingConfig;
}
```

### 3.2 Stream events (shared optionnel)
Optionnel, mais recommandé pour typer le client:
```ts
export type AiStreamStage = 'capture'|'context'|'model'|'latex'|'persist'|'done';

export type AiStreamEvent =
  | { type: 'status'; stage: AiStreamStage; message?: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage?: Record<string, number | undefined> }
  | { type: 'credits'; remaining?: number }
  | { type: 'error'; error: string }
  | { type: 'done'; model: string; provider: string };
```

## 4) Backend: implémentation streaming
Fichiers:
- apps/backend/src/routes/ai.ts
- apps/backend/src/services/ai-service.ts

### 4.1 Zod
Créer un schema pour `/stream` identique à `analyzeSchema` + `thinking`.

### 4.2 SSE helper
Créer un helper local:
- `writeEvent(res, event)` qui fait `res.write('data: ...\n\n')`.
- Headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`

### 4.3 Streaming Gemini
Remplacer `generateContent()` par `generateContentStream()` dans la branche streaming.

Pseudo (intention):
```ts
write(status('model'));
const stream = await genAI.models.generateContentStream({ ... });
for await (const chunk of stream) {
  const delta = chunk?.text ?? '';
  if (delta) write({ type:'delta', text: delta });
}
```

### 4.4 Latex validation/repair (important)
Le backend fait actuellement:
- nettoyage,
- validation KaTeX,
- éventuellement une réparation LLM.

Pour le streaming, 2 stratégies:

**Stratégie A (MVP, simple):**
- Streamer le texte brut.
- À la fin: faire la validation/réparation et envoyer un dernier event `status: 'latex'` puis `done`.
- Côté UI: si le texte final diffère (réparé), remplacer le message final (update).

**Stratégie B (plus “propre”):**
- Bufferiser côté backend, ne streamer qu’après validation.
  (Perd l’intérêt du streaming — pas recommandé en MVP.)

Recommandation: A.

### 4.5 Persistance DB
- Pendant streaming: ne pas écrire en DB à chaque delta.
- À la fin: écrire le message final comme aujourd’hui.
- Envoyer `credits.remaining` si premium.

## 5) Frontend: streaming + UI process
Fichiers:
- apps/web/src/hooks/useAI.ts
- apps/web/src/components/AISidebar/ChatMessage.tsx
- apps/web/src/components/AISidebar/InputBox.tsx
- apps/web/src/pages/Whiteboard.tsx

### 5.1 UX: message “en cours”
Quand l’utilisateur envoie:
- Ajouter immédiatement un message assistant “draft” dans le feed.
- Afficher:
  - un badge “Thinking…”
  - une ligne de statut stage (ex: “Analyse du tableau…”, “Rédaction…”, etc.)

### 5.2 Lire un flux SSE via fetch
- `fetch('/api/ai/analyze/stream', { signal })`
- Lire `response.body` avec `ReadableStreamDefaultReader` + `TextDecoder`.
- Parser SSE minimal:
  - split par `\n\n`
  - extraire lignes `data:`
  - `JSON.parse(data)`

### 5.3 Mise à jour incrémentale UI
À chaque event:
- `delta`: append au texte du message assistant “draft”.
- `status`: update un champ `thinkingStage`/`thinkingLabel`.
- `done`: marquer message “final”.
- `error`: afficher un message d’erreur inline (et option retry).

### 5.4 Annulation
- Bouton “Stop” pendant streaming.
- `AbortController.abort()`
- UI: message assistant marqué “interrompu” (et éventuellement conservé).

### 5.5 Contrôle thinking (UI)
Dans InputBox:
- Select thinking (Auto/Low/Medium/High)
- Option avancée budget (phase 2)
- Visible uniquement si modèle Gemini 3.

Payload envoyé:
```ts
thinking: { mode:'auto' } | { mode:'level', level:'high' } | { mode:'budget', budget:1024 }
```

## 6) Compatibilité / fallback
- Si `response.body` est null (certains environnements), fallback vers `/api/ai/analyze`.
- Si streaming backend renvoie 4xx/5xx, fallback vers non-streaming avec toast.

## 7) Rollout plan
1) Shared: ajouter `thinking` + types events optionnels.
2) Backend: ajouter endpoint `/api/ai/analyze/stream` en MVP Gemini-only.
3) Frontend: parser SSE + message draft + bouton Stop.
4) Ajouter UI “Thinking stage” + select thinking.
5) Étendre aux providers OpenAI/Anthropic si besoin.

## 8) Critères d’acceptation
- L’utilisateur voit le texte arriver en temps réel.
- Le user peut arrêter une génération.
- La UI affiche les stages (sans exposition chain-of-thought).
- Le backend ne renvoie jamais de thoughts.
- “Auto” conserve le comportement serveur (env vars), les autres modes override proprement.

## 9) Points ouverts
- Nommer le endpoint: `/api/ai/analyze/stream` vs `/api/ai/stream`.
- Stratégie exacte pour remplacer le texte final après réparation LaTeX (MVP: replace-on-done).
- Pour tutor mode: définir des stages supplémentaires (`plan`, `step`).
