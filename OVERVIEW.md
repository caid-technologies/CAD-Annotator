# Overview

CAD Annotator is an AI-powered tool for analyzing engineering drawings and CAD files. Upload a blueprint or technical drawing, and the system returns annotations, dimensions, measurements, tolerances, and labels as interactive bounding boxes.

## Key Capabilities

- Upload drawings through the web UI and receive annotated results.
- Extract dimensions, tolerances, labels, and callouts from images.
- Review manufacturability (DFM) feedback with a text-only model.
- Use a typed API backed by an OpenAPI specification.

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, Radix UI, TanStack React Query, Wouter  
**Backend:** Express 5, TypeScript, Pino (structured logging), ESBuild  
**AI:** OpenAI-compatible vision model for CAD drawing analysis  
**Database:** PostgreSQL with Drizzle ORM (SQLite fallback supported)  
**Code Generation:** Orval (OpenAPI → React Query hooks + Zod schemas)  
**Package Manager:** pnpm (workspace monorepo)

## API Surface

| Method | Path           | Description                 |
| ------ | -------------- | --------------------------- |
| `GET`  | `/api/healthz` | Health check                |
| `POST` | `/api/analyze` | Analyze a CAD drawing image |

See `lib/api-spec/openapi.yaml` for the full OpenAPI specification.
