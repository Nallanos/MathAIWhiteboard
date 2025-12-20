# PostHog (analytics)

Ce repo supporte PostHog côté **web** (pageviews + identify) et côté **backend** (events d’auth) via variables d’env.

## Option recommandée: PostHog Cloud

1) Crée un projet PostHog (Cloud) et récupère:
- **Project API key** (ex: `phc_...`)
- **Host** (`https://app.posthog.com` ou `https://eu.posthog.com` selon ta région)

2) Ajoute ces variables dans Railway (service qui build tout le monorepo via Nixpacks):

### Frontend (Vite) – build-time

- `VITE_POSTHOG_ENABLED=true`
- `VITE_POSTHOG_KEY=phc_xxx`
- `VITE_POSTHOG_HOST=https://app.posthog.com` (ou `https://eu.posthog.com`)

Note: comme c’est Vite, ces variables sont **lues au build**. Après modification, relance un deploy.

### Backend – runtime

- `POSTHOG_ENABLED=true`
- `POSTHOG_PROJECT_API_KEY=phc_xxx`
- `POSTHOG_HOST=https://app.posthog.com` (ou `https://eu.posthog.com`)

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

**Backend – runtime**:

- `POSTHOG_ENABLED=true`
- `POSTHOG_PROJECT_API_KEY=phc_xxx`
- `POSTHOG_HOST=https://$POSTHOG_PUBLIC_HOST`

Notes:
- `VITE_POSTHOG_*` est lu **au build** (Vite). Dans `docker-compose.yml`, on passe ces valeurs en `build.args` du service `frontend`.
- Le service `backend` lit `POSTHOG_*` au runtime.

## Ce qui est tracké

- Web:
  - `$pageview` à chaque navigation
  - `identify(user.id)` après login (et au reload si token présent)
  - `reset()` au logout

- Backend (si activé):
  - `user_registered` (register password)
  - `user_logged_in` (login password / google)
