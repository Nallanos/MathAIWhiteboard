# PostHog (analytics)

Ce repo supporte PostHog côté **web** (pageviews + identify) et côté **backend** (events d’auth) via variables d’env.

Ce doc suit les recommandations PostHog (posthog-js) et ajoute quelques notes spécifiques à ce monorepo.

## Option recommandée: PostHog Cloud

1) Crée un projet PostHog (Cloud) et récupère:
- **Project API key** (ex: `phc_...`)
- **Host** (`https://app.posthog.com` ou `https://eu.posthog.com` selon ta région)

2) Ajoute ces variables dans Railway (service qui build tout le monorepo via Nixpacks):

### Frontend (Vite) – build-time

- `VITE_POSTHOG_ENABLED=true`
- `VITE_POSTHOG_KEY=phc_xxx`
- `VITE_POSTHOG_HOST=https://us.i.posthog.com` (ou `https://eu.i.posthog.com` selon ta région)

Optionnel (si tu utilises un reverse proxy d’events) :

- `VITE_POSTHOG_UI_HOST=https://app.posthog.com` (ou `https://eu.posthog.com`)

Optionnel (opt-out) :

- `VITE_POSTHOG_OPT_OUT_BY_DEFAULT=true`

Note: comme c’est Vite, ces variables sont **lues au build**. Après modification, relance un deploy.

### Backend – runtime

- `POSTHOG_ENABLED=true`
- `POSTHOG_PROJECT_API_KEY=phc_xxx`
- `POSTHOG_HOST=https://us.i.posthog.com` (ou `https://eu.i.posthog.com`)

## Option self-host (à éviter sur Railway)

PostHog self-host nécessite plusieurs services (notamment ClickHouse). Railway peut le faire, mais c’est souvent plus fragile/cher qu’un VPS ou que PostHog Cloud.

## Self-host Docker (ce repo)

Ce repo inclut maintenant une stack PostHog **Docker Compose** (Postgres + Redis + ClickHouse + Kafka + PostHog web/worker/plugins) exposée via **Traefik**.

### Pré-requis

- Une machine avec assez de ressources (PostHog n’est pas “light”).
- Un nom de domaine séparé pour PostHog.

Avec DuckDNS, le plus simple est de créer **un 2e sous-domaine** pointant vers la même IP, par exemple:

- `mathbordai.duckdns.org` (ton SaaS)
- `mathbordai-posthog.duckdns.org` (PostHog)

### Variables d’env (Docker Compose)

Définis ces variables (dans ton `.env` au même niveau que `docker-compose.yml`, ou dans ton environnement):

- `POSTHOG_PUBLIC_HOST=mathbordai-posthog.duckdns.org`
- `POSTHOG_SITE_URL=https://mathbordai-posthog.duckdns.org`

Génère des secrets:

```bash
openssl rand -hex 32
openssl rand -hex 16
```

Puis:

- `POSTHOG_SECRET_KEY=<hex32>`
- `POSTHOG_ENCRYPTION_SALT_KEYS=<hex16>`

Optionnel:

- `POSTHOG_DB_PASSWORD=posthog` (change-le si tu veux)

### Démarrer PostHog

```bash
docker compose up -d posthog-db posthog-redis posthog-kafka posthog-clickhouse posthog-web posthog-worker posthog-plugins
```

Ensuite ouvre:

- `https://$POSTHOG_PUBLIC_HOST`

### Connecter ton SaaS à ton PostHog self-host

**Frontend (Vite) – build-time** (si tu rebuild l’image `frontend` via Docker):

- `VITE_POSTHOG_ENABLED=true`
- `VITE_POSTHOG_KEY=phc_xxx` (Project API key depuis l’UI PostHog)
- `VITE_POSTHOG_HOST=https://$POSTHOG_PUBLIC_HOST`

Optionnel (si tu mets un reverse proxy devant l’ingestion) :

- `VITE_POSTHOG_UI_HOST=https://$POSTHOG_PUBLIC_HOST` (dans un setup self-host, UI et ingestion sont souvent le même host)

**Backend – runtime**:

- `POSTHOG_ENABLED=true`
- `POSTHOG_PROJECT_API_KEY=phc_xxx`
- `POSTHOG_HOST=https://$POSTHOG_PUBLIC_HOST`

Notes:
- `VITE_POSTHOG_*` est lu **au build** (Vite). Dans `docker-compose.yml`, on passe ces valeurs en `build.args` du service `frontend`.
- Le service `backend` lit `POSTHOG_*` au runtime.

## Installation (web)

Ce repo utilise `posthog-js` via NPM et initialise PostHog dans [apps/web/src/main.tsx](apps/web/src/main.tsx) et [apps/web/src/lib/posthog.ts](apps/web/src/lib/posthog.ts).

Tu n’as **pas** besoin d’ajouter le snippet HTML dans `index.html`.

## Track across marketing website & app

Si tu as un site marketing (ex: `yourapp.com`) et l’app (ex: `app.yourapp.com`), l’approche la plus simple:

- Installe PostHog sur **les deux** (même Project API key + même host d’ingestion).
- Assure-toi d’appeler `identify()` après login côté app (déjà fait dans ce repo).

PostHog peut suivre un utilisateur à travers des sous-domaines selon ta configuration (cookies). Si tu observes une perte d’attribution entre domaines, regarde la doc PostHog “cross-domain / cross-subdomain tracking” et ajuste la config cookies.

## Replay triggers

Les “replay triggers” (session recording) se configurent principalement dans l’UI PostHog:

- URL triggers: démarrer/mettre en pause l’enregistrement selon des patterns d’URL.
- Event triggers: démarrer l’enregistrement juste avant d’envoyer certains events.

Aucune modif de code n’est nécessaire pour ça dans ce repo.

## Opt out of data capture

Deux approches:

1) **Opt-out par défaut** (recommandé si tu veux un consentement explicite)

- Mets `VITE_POSTHOG_OPT_OUT_BY_DEFAULT=true`.

2) **Opt-out / opt-in à la demande**

Ce repo expose des helpers:

- `optOutPostHog()`
- `optInPostHog()`
- `hasOptedOutPostHog()`

Tu peux les appeler depuis ton UI de consentement (bannière cookies, préférences utilisateur, etc.).

## Running more than one instance of PostHog at the same time

PostHog supporte plusieurs instances (nommées) via le 3e paramètre de `posthog.init(key, options, name)`.

Dans ce repo, on utilise l’instance par défaut. Si tu veux plusieurs projets (ex: produit vs marketing), le plus simple est de:

- garder l’instance par défaut pour l’app,
- initialiser une 2e instance nommée dans un endroit dédié (ex: un module “marketing analytics”),
- désactiver l’autocapture sur l’instance secondaire pour éviter les doublons.

## Development

Pour éviter d’envoyer des données de dev:

- laisse `VITE_POSTHOG_ENABLED` à `false` en local, ou
- utilise une Project API key dédiée “dev”, ou
- configure un filtrage côté PostHog (par domaine/host).

## Reverse proxy (recommandé avant prod)

Les adblockers bloquent souvent les domaines connus d’analytics. Un reverse proxy d’ingestion aide à récupérer plus d’events.

### PostHog Cloud (managed proxy)

Si tu utilises le proxy managé PostHog (ex: `https://ph.myapp.com`), configure:

- `VITE_POSTHOG_HOST=https://ph.myapp.com` (le proxy, pour l’ingestion)
- `VITE_POSTHOG_UI_HOST=https://app.posthog.com` (ou `https://eu.posthog.com`, pour les features UI/toolbar)

### Self-host

En self-host, tu peux aussi mettre un proxy (Nginx/Caddy/Traefik) devant l’ingestion. Dans ce cas:

- `VITE_POSTHOG_HOST=https://<ton-subdomain-proxy>`
- `VITE_POSTHOG_UI_HOST=https://<ton-posthog-ui-host>` (souvent identique au host proxy si tu exposes tout via le même domaine)

## Ce qui est tracké

- Web:
  - `$pageview` à chaque navigation
  - `identify(user.id)` après login (et au reload si token présent)
  - `reset()` au logout

- Backend (si activé):
  - `user_registered` (register password)
  - `user_logged_in` (login password / google)
