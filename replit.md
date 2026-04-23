# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (no user API key required)

## Artifacts

### AI CAD Annotation & Review (`artifacts/cad-annotator`)
- React + Vite frontend at `/`
- Upload CAD drawing images and get AI-powered annotations with bounding boxes
- Features: drag-and-drop upload, natural language description toggle, baseline mode, annotation cards
- Uses OpenAI GPT-4 vision model via the analyze endpoint

### API Server (`artifacts/api-server`)
- Express 5 backend
- `/api/analyze` — POST endpoint for CAD drawing analysis using OpenAI vision

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
