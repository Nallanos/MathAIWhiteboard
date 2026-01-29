# Récapitulatif : Streaming AI & "Thinking UI" (Gemini 3)

Ce document résume l'implémentation du streaming en temps réel et de l'interface de "Thinking" pour les modèles Gemini 3, réalisée le 24 janvier 2026.

## 1. Objectif de la Feature
L'objectif principal est d'améliorer l'expérience utilisateur (UX) lors des interactions avec l'IA :
- **Réduction de la latence perçue** : Afficher le texte au fur et à mesure de sa génération (Streaming).
- **Transparence du processus** : Afficher les étapes internes de l'IA (Analyse, Rédaction, etc.) via une "Thinking UI" sans pour autant exposer le raisonnement brut (Chain-of-Thought) pour des raisons de clarté et de sécurité.
- **Contrôle utilisateur** : Permettre de régler le niveau de réflexion (Thinking Level) pour les modèles Gemini 3 afin d'équilibrer vitesse et précision.

## 2. Architecture & Modifications (Où chercher ?)

Les modifications sont réparties sur l'ensemble de la monorepo :

### Shared (Contrats de données)
- [packages/shared/src/ai.ts](packages/shared/src/ai.ts) : Définition des types `ThinkingConfig`, `AiStreamEvent` et mise à jour de `AIPromptPayload`.

### Backend (Logique serveur)
- [apps/backend/src/routes/ai.ts](apps/backend/src/routes/ai.ts) : Création du nouvel endpoint SSE `POST /api/ai/analyze/stream`.
- [apps/backend/src/services/ai-service.ts](apps/backend/src/services/ai-service.ts) : 
    - Intégration de `generateContentStream` du SDK Google GenAI.
    - Gestion de la persistance en base de données après la fin du flux.
    - Logique de validation/réparation LaTeX post-streaming.

### Frontend (Interface utilisateur)
- [apps/web/src/hooks/useAI.ts](apps/web/src/hooks/useAI.ts) : Nouveau hook supportant le parsing SSE, la gestion de l'annulation (`AbortController`) et les messages "draft".
- [apps/web/src/components/AISidebar/InputBox.tsx](apps/web/src/components/AISidebar/InputBox.tsx) : Ajout du sélecteur de niveau de réflexion et du bouton "Stop".
- [apps/web/src/pages/Whiteboard.tsx](apps/web/src/pages/Whiteboard.tsx) : Connexion du hook au composant de la barre latérale.

## 3. Choix Techniques Structurants

### Stratégie de Streaming LaTeX (Stratégie A)
Nous avons choisi de **streamer le texte brut immédiatement**. La validation et la réparation des formules LaTeX ne se font qu'une fois le flux terminé. 
- *Pourquoi ?* Pour garantir une réactivité maximale dès le premier token, quitte à corriger légèrement le message final si une erreur LaTeX est détectée à la fin.

### Exclusion du "Chain-of-Thought" (CoT)
Bien que Gemini 3 produise des pensées internes, le backend force `includeThoughts: false`.
- *Pourquoi ?* Préserver la propreté de l'UI et éviter d'exposer des étapes de raisonnement qui pourraient être confuses ou non pertinentes pour l'utilisateur final.

### Streaming limité au "Board Mode"
Le streaming est activé pour l'analyse du tableau blanc, mais pas encore pour le "Tutor Mode".
- *Pourquoi ?* Le mode tuteur nécessite des réponses JSON très structurées et une gestion par étapes complexes qui sont plus robustes via un appel HTTP classique (non-streaming) pour une première version (MVP).

### Gestion des Crédits
Les crédits sont débités au début de la requête (estimation) et ajustés ou remboursés en cas d'erreur ou d'annulation précoce.

## 4. Sécurité & Garde-fous
- **Clamping** : Le backend valide et limite strictement les valeurs de `budget` et de `level` envoyées par le client pour éviter les abus ou les erreurs d'API.
- **Interruption côté serveur** : Si l'utilisateur ferme l'onglet ou clique sur "Stop", le backend détecte la coupure du flux et arrête immédiatement la génération pour économiser les ressources.
