# =============================================================================
# CAD Annotator — Multi-Stage Dockerfile
# =============================================================================
# Builds the pnpm monorepo in three stages:
#   1. base    — install pnpm + workspace dependencies
#   2. build   — compile api-server (esbuild) and cad-annotator (vite)
#   3. runtime — minimal image with built artifacts, runs as non-root user
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: base — install pnpm and workspace dependencies
# ---------------------------------------------------------------------------
FROM node:24-slim AS base

# Disable corepack and install pnpm explicitly so container builds use the
# same package manager as the workspace regardless of the base image defaults.
ENV COREPACK_ENABLE_STRICT=0
RUN corepack disable && npm install -g pnpm@latest

WORKDIR /app

# Copy lockfile and workspace configuration first for layer caching.
# Dependencies are only re-installed when these files change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copy all workspace package.json files so pnpm can resolve the workspace graph.
# Each package needs its own package.json for pnpm install to succeed.
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/cad-annotator/package.json artifacts/cad-annotator/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/package.json
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/package.json
COPY scripts/package.json scripts/package.json

# Install all dependencies (including devDependencies needed for the build stage)
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build — compile api-server and cad-annotator
# ---------------------------------------------------------------------------
FROM base AS build

WORKDIR /app

# Copy the full source tree (dependencies are already installed from base stage)
COPY . .

# Build shared libraries first (typecheck builds them via tsc --build)
RUN pnpm run typecheck:libs

# Build the API server (esbuild bundle → artifacts/api-server/dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# Build the frontend (vite build → artifacts/cad-annotator/dist/public/)
RUN pnpm --filter @workspace/cad-annotator run build

# Prune devDependencies to shrink the final image
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Stage 3: runtime — minimal production image
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime

# Install pnpm (needed for running drizzle-kit push in entrypoint)
ENV COREPACK_ENABLE_STRICT=0
RUN corepack disable && npm install -g pnpm@latest

# Create a non-root user for security
RUN groupadd --system appuser && useradd --system --gid appuser appuser

WORKDIR /app

# Copy production node_modules from the pruned build stage
COPY --from=build /app/node_modules ./node_modules

# Copy workspace package manifests (pnpm needs these for --filter commands)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/lib/db/package.json lib/db/package.json
COPY --from=build /app/lib/db/node_modules lib/db/node_modules
COPY --from=build /app/artifacts/api-server/package.json artifacts/api-server/package.json

# Copy the database package (needed for drizzle-kit push migrations)
COPY --from=build /app/lib/db/src lib/db/src
COPY --from=build /app/lib/db/drizzle.config.ts lib/db/drizzle.config.ts

# Copy built API server artifacts
COPY --from=build /app/artifacts/api-server/dist artifacts/api-server/dist

# Copy built frontend static files
COPY --from=build /app/artifacts/cad-annotator/dist/public artifacts/cad-annotator/dist/public

# Copy the entrypoint script
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

# Switch to non-root user
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

ENTRYPOINT ["/app/docker/entrypoint.sh"]
