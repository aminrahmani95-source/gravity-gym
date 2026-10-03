# =============================================================================
# Production Dockerfile for @gym-app/web
# Build Context: Repository Root
# Build Command: docker build -f apps/web/Dockerfile -t gym-app-web .
# =============================================================================

# --- Stage 1: Build Dependencies & Compile ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root & workspace package manifests
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/web/package.json ./apps/web/

# Install full workspace dependencies for building
RUN npm install

# Copy source trees
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web

# Compile shared-types dependency first
RUN npm run --workspace=@gym-app/shared-types build

# Public client-side configuration arguments
# Hardened security default: Demo auto-login is strictly DISABLED in production
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENABLE_DEMO_LOGIN=$NEXT_PUBLIC_ENABLE_DEMO_LOGIN

# Compile Next.js web application
RUN npm run --workspace=@gym-app/web build

# Prune development dependencies for minimal production footprint
RUN npm prune --omit=dev

# --- Stage 2: Hardened Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Ensure demo login remains disabled in production container
ENV NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false

# Run as built-in non-root user
USER node

# Copy production node_modules and built Next.js artifacts
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --chown=node:node --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --chown=node:node --from=builder /app/apps/web/package.json ./apps/web/
COPY --chown=node:node --from=builder /app/apps/web/next.config.ts ./apps/web/
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=builder /app/apps/web/.next ./apps/web/.next

WORKDIR /app/apps/web

EXPOSE 3000

# Healthcheck testing frontend HTTP availability
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Next.js via standard production start command
CMD ["npm", "run", "start"]
