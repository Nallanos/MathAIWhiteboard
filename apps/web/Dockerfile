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

# Set production API URL
ENV VITE_BACKEND_URL=https://mathbordai.duckdns.org
ENV VITE_WS_URL=https://mathbordai.duckdns.org

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
