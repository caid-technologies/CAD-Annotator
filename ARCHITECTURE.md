# Architecture & Pipeline

## Repository Layout

This is a **pnpm monorepo** with three main artifacts and several shared libraries:

```
├── artifacts/
│   ├── api-server/          # Express.js backend (OpenAI vision API integration)
│   ├── cad-annotator/       # React frontend (upload, preview, annotation display)
│   └── mockup-sandbox/      # Component preview server (design system development)
│
├── lib/
│   ├── api-spec/            # OpenAPI specification + Orval code generation config
│   ├── api-zod/             # Generated Zod validation schemas (from OpenAPI spec)
│   ├── api-client-react/    # Generated React Query hooks (from OpenAPI spec)
│   ├── db/                  # Drizzle ORM database layer (PostgreSQL)
│   ├── integrations-openai-ai-server/   # OpenAI SDK wrapper (server-side)
│   └── integrations-openai-ai-react/    # OpenAI audio/voice hooks (client-side)
│
└── scripts/                 # Utility scripts (DB migrations, etc.)
```

## Pipeline Overview

1. A user uploads a CAD drawing or blueprint in the frontend.
2. The frontend calls `POST /api/analyze` on the API server.
3. The pipeline orchestrator uses a vision-capable model (`OPENAI_MODEL`) to detect annotations, dimensions, and labels.
4. The DFM reviewer uses a text-only model (`DFM_MODEL`) to generate manufacturability feedback.
5. Results are returned to the frontend and rendered as interactive overlays.

## Model Configuration

The system uses two separate model settings so you can pair a capable vision model with a lighter text model:

| Variable       | Purpose                        | Default       | Requirements         |
| -------------- | ------------------------------ | ------------- | -------------------- |
| `OPENAI_MODEL` | Annotation detection (Stage 1) | `gpt-4o`      | Must support vision  |
| `DFM_MODEL`    | DFM manufacturability review   | `gpt-4o-mini` | Text-only, any model |

`OPENAI_MODEL` is used by the pipeline orchestrator and re-query service for image analysis. `DFM_MODEL` is used by the DFM reviewer for text-based manufacturability feedback. Using `gpt-4o-mini` for DFM keeps costs down without sacrificing quality on text tasks.
