#!/bin/bash
# =============================================================================
# Post-Merge Hook
#
# Runs after a git merge to ensure dependencies are up to date and the
# database schema is synchronised. Useful as a git hook or CI step.
# =============================================================================
set -e

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Pushing database schema..."
pnpm --filter @workspace/db run push

echo "Post-merge complete."
