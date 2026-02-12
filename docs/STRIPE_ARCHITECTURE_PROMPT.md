# Sujet : Architecture de l'Intégration Stripe pour Whiteboard AI

## Contexte
Whiteboard AI est une plateforme SaaS permettant de collaborer sur des tableaux blancs augmentés par l'IA. Le projet utilise une architecture monorepo (pnpm) :
- `apps/backend` : API Node.js/TypeScript (Drizzle ORM).
- `apps/web` : Frontend Vite/React.
- `packages/shared` : Types et logique partagée.

Nous devons intégrer Stripe pour gérer :
1. Les abonnements récurrents (Free/Pro).
2. Le système de Pay-as-you-go (Achat de crédits IA "Top-up" et/ou Facturation à l'usage "Metered Billing").
3. La gestion des limites d'utilisation en fonction du plan.

## Objectif du Prompt
Produire un plan d'architecture **complet, scalable et robuste** pour l'intégration de Stripe. Le design doit garantir une cohérence parfaite entre l'état de Stripe et la base de données locale, tout en minimisant les risques de fraude et d'erreurs de facturation.

## Consignes pour l'IA Architecte

### 1. Gestion des Webhooks & Fiabilité
- Détaille la stratégie de sécurisation des webhooks (validation de signature).
- Propose un mécanisme d'**idempotence** robuste pour éviter les traitements multiples (ex: créditer des jetons deux fois).
- Explique comment gérer les échecs de traitement côté backend pour permettre des retries propres de Stripe.

### 2. Modèle de Données & Synchronisation
- Propose un schéma de base de données étendu (Drizzle) pour suivre non seulement l'état actuel (`subscriptionStatus`), mais aussi l'historique ou les périodes de facturation si nécessaire.
- Explique comment gérer la transition des états (`active`, `past_due`, `canceled`, `incomplete`) et l'accès aux features durant ces phases.

### 3. Système de Crédits & Usage (Pay-as-you-go)
- **Reporting d'usage** : Si nous utilisons le Metered Billing, quelle est l'architecture recommandée pour envoyer l'usage à Stripe sans impacter les performances de l'API ? (Agrégration vs Temps réel).
- **Consommation de crédits** : Détaille la logique transactionnelle pour déduire les `aiCredits` de l'utilisateur de manière atomique lors d'un appel IA.

### 4. Middleware de "Feature Gating"
- Conçois une architecture de middleware backend qui vérifie les droits (Plan + Crédits) avant d'autoriser l'accès aux services IA.
- Propose une stratégie de mise en cache (ex: Redis ou cache applicatif) pour éviter des requêtes SQL répétitives sur chaque appel API pour vérifier les droits.

### 5. Intégration Frontend & Portail Client
- Décris le flux de checkout idéal (Redirection vs Stripe Elements).
- Explique comment intégrer élégamment le **Stripe Customer Portal** pour que l'utilisateur gère lui-même ses moyens de paiement et son abonnement.
- Comment informer le frontend du succès d'un paiement asynchrone (via Webhooks) ? (Polling, WebSockets, ou redirection intelligente).

### 6. Sécurité & Fraude
- Quelles sont les recommandations pour éviter qu'un utilisateur n'injecte des crédits via l'API sans paiement réel ?
- Comment gérer les "Chargebacks" (répudiations de paiement) au niveau de l'architecture ?

### 7. Observabilité & Analytics
- Propose un plan de tags pour PostHog afin de suivre l'entonnoir de conversion (Pricing -> Checkout -> Success).
- Comment monitorer la santé de la file d'attente des webhooks ?

## Livrables attendus
- Un schéma d'architecture (ou description textuelle claire des flux).
- Les définitions TypeScript clés (Interfaces, Enums).
- Un guide d'implémentation par étapes prioritaires.
