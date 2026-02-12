# Mission : Architecture du Service Email & Authentification Discord

Tu es un **Architecte Logiciel Senior** spécialisé dans les écosystèmes TypeScript (Node.js/Fastify) et les stratégies de croissance SaaS. Ta mission est de concevoir un plan d'implémentation technique détaillé pour ajouter deux fonctionnalités majeures à **WhiteboardAI** : un **Service Email optimisé pour la rétention** et l'**Authentification via Discord**.

---

## 1. Contexte Technique Actuel
- **Frontend :** React (Vite), Tailwind CSS, TanStack Router.
- **Backend :** Node.js, Fastify, Drizzle ORM (PostgreSQL), Zod.
- **Authentification :** Système actuel à vérifier (Email/Password et potentiellement Google déjà présent).
- **Structure :** Monorepo (apps/web, apps/backend, packages/shared).

---

## 2. Objectifs & Contraintes

### A. Service Email (Rétention & Transactionnel)
- **Stack Imposée :** [Resend](https://resend.com) (Envoi/Webhooks) + [React Email](https://react.email) (Templating).
- **Philosophie "Low Friction" :** 
    - L'utilisateur doit pouvoir utiliser l'application **immédiatement** après l'inscription.
    - Pas d'email de confirmation bloquant. 
    - La vérification doit être asynchrone (envoi d'un mail de bienvenue avec lien de validation, mais accès total au board maintenu).
- **Délivrabilité :** Implémenter la gestion des "Hard Bounces" via les webhooks Resend pour marquer les adresses invalides en base de données.
- **Rétention :** Prévoir une architecture permettant d'envoyer des "Engagement Emails" (ex: résumé de l'activité sur les boards, relance après 3 jours d'inactivité).
- **Facilité de désabonnement :** Un lien de désabonnement en un clic (via token sécurisé, sans login requis) doit être présent dans chaque mail de rétention.

### B. Authentification Discord
- Intégrer Discord comme fournisseur OAuth2.
- **Règle métier :** Utiliser le flag `verified` fourni par Discord. Si l'email Discord est vérifié, il est automatiquement marqué comme vérifié dans WhiteboardAI.
- Mapper les données Discord (Username, Avatar, Email) vers le profil utilisateur local.

---

## 3. Livrables Attendus (Ton Plan)

Pour que l'exécutant puisse coder sans ambiguïté, ton plan doit contenir :

1.  **Modifications Schema (Drizzle) :**
    - Ajout des champs dans la table `users` (`email_verified`, `discord_id`, `marketing_opt_in`, `last_login_at`, etc.).
    - Création de la table ou des colonnes pour gérer les tokens de désabonnement/vérification.

2.  **Architecture du Service Email (`apps/backend/src/services/email.service.ts`) :**
    - Structure de la classe `EmailService`.
    - Méthodes clés : `sendWelcomeEmail`, `sendRetentionDigest`, `handleWebhook`.

3.  **Flux d'Authentification Discord :**
    - Description précise des endpoints (`/api/auth/discord/login`, `/api/auth/discord/callback`).
    - Logique de "Link account" si l'email existe déjà via Google ou Email/Password.

4.  **Gestion des Webhooks Resend :**
    - Comment le backend doit valider et traiter les événements `email.bounced` et `email.delivered`.

5.  **Stratégie de Rétention (Chronologie) :**
    - Définir comment et quand les emails de rétention sont déclenchés (Worker, Cron, ou événements logés en DB).

6.  **Guide d'implémentation Step-by-Step :**
    - Liste ordonnée des tâches (ex: 1. Migration DB, 2. Setup Resend, 3. Templating React Email, etc.).

---

## 4. Instructions Spécifiques pour toi (l'Architecte)
- Ne te contente pas de généralités. Donne les noms des fichiers à créer ou modifier.
- Utilise les patterns déjà présents dans le projet (Zod pour la validation, typage partagé dans `packages/shared`).
- Assure-toi que la sécurité n'est pas sacrifiée (protection des liens de désabonnement contre le brute-force).
- **Rédige ta réponse sous forme de guide technique complet directement prêt à l'emploi.**
