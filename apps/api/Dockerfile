# =============================================================================
# Production Dockerfile for @gym-app/api
# Build Context: Repository Root
# Build Command: docker build -f apps/api/Dockerfile -t gym-app-api .
# =============================================================================

# --- Stage 1: Build Dependencies & Compile ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root & workspace package manifests
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install full workspace dependencies for building
RUN npm install

# Copy source trees
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Compile shared-types dependency first
RUN npm run --workspace=@gym-app/shared-types build

# Compile NestJS API application
RUN npm run --workspace=@gym-app/api build

# Prune development dependencies for minimal production footprint
RUN npm prune --omit=dev

# --- Stage 2: Hardened Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Run as built-in non-root user
USER node

# Copy production node_modules and compiled artifacts
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --chown=node:node --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 4000

# Healthcheck targeting the minimal API readiness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 4000) + '/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start API via production command
CMD ["node", "dist/src/main.js"]
