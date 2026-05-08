#!/bin/sh
set -e

# Run database migrations (idempotent)
pnpm --filter @workspace/db run push

# Start the combined server
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
