# ===========================================
# Frontend Dockerfile
# Multi-stage build for Vite React app
# ===========================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build-time configuration (Vite reads env at build time)
ARG VITE_BACKEND_URL=https://mathbordai.duckdns.org
ARG VITE_WS_URL=https://mathbordai.duckdns.org
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_POSTHOG_ENABLED=false
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_POSTHOG_ENABLED=$VITE_POSTHOG_ENABLED
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

# Build the frontend
WORKDIR /app/apps/web
RUN pnpm build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Nginx runs on port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
