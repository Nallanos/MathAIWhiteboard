# Guide de Debugging : Streaming AI bloqué

Ce document est destiné à aider à identifier pourquoi le streaming s'arrête prématurément (pas de génération de message) malgré la réception de la requête par l'API.

## État actuel du problème
D'après les logs Network :
1. La requête est reçue par `/api/ai/analyze/stream`.
2. Le flux SSE commence et envoie :
   - `{"type":"status","stage":"capture","message":"Preparing..."}`
   - `{"type":"status","stage":"context","message":"Loading context..."}`
3. Le flux semble s'arrêter ou rester en attente après cela. L'étape `"stage":"model"` (**Generating...**) n'est jamais reçue.

## Où chercher le problème ?

Le problème se situe probablement dans [apps/backend/src/services/ai-service.ts](apps/backend/src/services/ai-service.ts) au sein de la méthode `analyzeStream`.

### 1. Analyse du flux d'exécution
Dans `analyzeStream`, voici l'ordre des opérations entre "Loading context" et "Generating" :

```typescript
// 1. Envoi du statut "context" (REÇU par le client)
onEvent({ type: 'status', stage: 'context', message: 'Loading context...' });

// 2. Chargement de la capture (Point de blocage potentiel A)
const capture = payload.captureId ? await this.loadCapture(payload.captureId) : null;

// 3. Chargement de l'historique (Point de blocage potentiel B)
const history = historyLimit > 0 ? await this.loadHistory(payload.conversationId, historyLimit) : [];

// 4. Logique de crédits (Point de blocage potentiel C)
if (shouldCharge) {
    // resolveAvailablePremiumGoogleModel fait un fetch externe à Google
    model = await this.resolveAvailablePremiumGoogleModel(model);
    // ...
}

// 5. Envoi du statut "model" (NON REÇU par le client)
onEvent({ type: 'status', stage: 'model', message: 'Generating...' });
```

### 2. Points de blocage probables

#### A. Blocage de la base de données (Points A & B)
Si la requête Drizzle vers `schema.captures` ou `schema.messages` reste en attente (timeout, lock, ou DB saturée), l'exécution n'atteindra jamais l'étape de génération.
- **Action** : Ajouter un `console.log('Capture loaded', !!capture)` juste après le chargement.

#### B. Résolution du modèle Premium (Point C)
Même si le modèle utilisé est `gemini-3-flash-preview` (gratuit), vérifiez si `shouldCharge` ne passe pas accidentellement à `true`. Si c'est le cas, `resolveAvailablePremiumGoogleModel` effectue un appel HTTP vers Google pour lister les modèles disponibles. Si cet appel échoue sans timeout ou avec une clé API invalide, cela peut bloquer.
- **Action** : Vérifier que `shouldCharge` est bien `false` pour le modèle utilisé.

#### C. Paramètres de "Thinking" (SDK @google/genai)
L'implémentation utilise le nouveau SDK `@google/genai`. 
Dans `generateWithGeminiStream`, nous construisons un objet `config` contenant `thinkingConfig`. Si cet objet est mal formé ou si le SDK rencontre une erreur non gérée lors de l'initialisation du stream, cela peut bloquer.
- **Attention** : `generateContentStream` attend souvent l'objet de configuration sous la clé `generationConfig` et non `config`.

## Feature Goal
Pour rappel, la feature vise à afficher les étapes de réflexion de l'IA (en changeant les labels d'état) et à streamer le texte pour que l'utilisateur n'attende pas 10 secondes devant un écran vide. Si le stream ne commence pas, nous perdons tout le bénéfice de la réactivité.
