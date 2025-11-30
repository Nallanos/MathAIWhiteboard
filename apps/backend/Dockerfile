# ===========================================
# Backend Dockerfile
# Multi-stage build for Node.js backend
# ===========================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the backend
WORKDIR /app/apps/backend
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backend

# Copy built files
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/drizzle ./apps/backend/drizzle

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Create data directory
RUN mkdir -p /app/data/captures && chown -R backend:nodejs /app/data

WORKDIR /app/apps/backend

USER backend

EXPOSE 4000

CMD ["node", "dist/index.js"]
