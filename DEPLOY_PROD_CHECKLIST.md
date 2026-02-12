# Guide de Déploiement Production (Railway)

Ce guide récapitule les étapes nécessaires pour activer l'authentification Discord, le service Email (Resend) et Stripe après le déploiement sur Railway.

## 1. Discord Developer Portal
Vous devez autoriser l'URL de production de votre application.
1. Allez sur [Discord Developer Portal](https://discord.com/developers/applications).
2. Sélectionnez votre application.
3. Allez dans **OAuth2** -> **General**.
4. Ajoutez une nouvelle URL dans **Redirects** : 
   `https://votre-backend-railway.app/api/auth/discord/callback`
5. Sauvegardez les changements.

## 2. Variables d'Environnement Railway
Dans votre interface Railway, assurez-vous que les variables suivantes sont configurées pour l'environnement de production :

### Authentication & URLs
- `FRONTEND_URL`: `https://votre-domaine.app`
- `DISCORD_CLIENT_ID`: (Votre ID Client)
- `DISCORD_CLIENT_SECRET`: (Votre Secret Client)
- `DISCORD_REDIRECT_URI`: `https://votre-backend-railway.app/api/auth/discord/callback`

### Email (Resend)
- `RESEND_API_KEY`: Votre clé API Resend (Clé de production `re_...`)
- `RESEND_WEBHOOK_SECRET`: À obtenir après la création du webhook dans Resend.
- `EMAIL_FROM_ADDRESS`: `noreply@votre-domaine.com` (Doit être un domaine vérifié dans Resend).

### Webhooks (Action requise post-déploiement)
1. **Resend Webhook** :
   - Allez dans votre dashboard Resend -> Webhooks.
   - Ajoutez l'URL : `https://votre-backend-railway.app/api/email/webhook`
   - Sélectionnez les évènements : `delivered`, `bounced`, `complained`.
   - Copiez le "Signing Secret" et mettez-le dans la variable `RESEND_WEBHOOK_SECRET` sur Railway.

2. **Stripe Webhook** :
   - Allez dans votre Dashboard Stripe -> Developers -> Webhooks.
   - Ajoutez l'URL : `https://votre-backend-railway.app/api/stripe/webhook`
   - Sélectionnez les évènements de facturation (checkout, subscription).
   - Copiez le secret `whsec_...` et mettez-le dans `STRIPE_WEBHOOK_SECRET` sur Railway.

## 3. Base de Données
Railway gère automatiquement les migrations si votre `start.sh` inclut la commande de migration.
Si vous avez ajouté des tables manuellement, assurez-vous d'exécuter `pnpm db:push` vers la base de données de production (ou utilisez les migrations générées).

## 4. DNS & Email
- Vérifiez que votre domaine est ajouté dans Resend et que les enregistrements DNS (SPF, DKIM, DMARC) sont validés pour éviter que les emails de bienvenue/vérification ne tombent en spam.
