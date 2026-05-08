# CAD Annotator

An AI-powered tool for analyzing engineering drawings and CAD files. Upload a blueprint or technical drawing, and the system uses OpenAI's vision model to extract annotations, dimensions, measurements, tolerances, and labels — displayed as interactive bounding boxes over the original image.

## Architecture

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

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, Radix UI, TanStack React Query, Wouter  
**Backend:** Express 5, TypeScript, Pino (structured logging), ESBuild  
**AI:** OpenAI GPT vision model for CAD drawing analysis  
**Database:** PostgreSQL with Drizzle ORM  
**Code Generation:** Orval (OpenAPI → React Query hooks + Zod schemas)  
**Package Manager:** pnpm (workspace monorepo)

## Prerequisites

- **Node.js** >= 24
- **pnpm** >= 9
- **PostgreSQL** (if using database features)
- **OpenAI API key** with vision model access

## Quick Start with Docker

The fastest way to get the full stack running:

```bash
cp .env.example .env
# Edit .env — set your AI_INTEGRATIONS_OPENAI_API_KEY at minimum

docker compose up
```

This starts the app (API + frontend) on **port 8080** and a PostgreSQL database on port 5432. Open [http://localhost:8080](http://localhost:8080) to use the app.

To also run a local LLM via Ollama (requires an NVIDIA GPU):

```bash
docker compose --profile local-llm up
```

See [Local LLM Setup](#local-llm-setup) below for model details.

## Getting Started (Manual)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable                          | Description                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `PORT`                            | API server port (default: `8080`)                                                             |
| `AI_INTEGRATIONS_OPENAI_API_KEY`  | Your OpenAI API key                                                                           |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI API base URL (default: `https://api.openai.com/v1`)                                    |
| `OPENAI_MODEL`                    | Vision model for annotation detection (default: `gpt-4o`)                                     |
| `DFM_MODEL`                       | Text model for DFM review — no vision needed (default: `gpt-4o-mini`)                         |
| `DATABASE_URL`                    | PostgreSQL connection string. Omit to use SQLite fallback (see below)                         |
| `POSTGRES_USER`                   | PostgreSQL username — used by Docker Compose (default: `cad_user`)                            |
| `POSTGRES_PASSWORD`               | PostgreSQL password — used by Docker Compose (**required**, no default in production)         |
| `POSTGRES_DB`                     | PostgreSQL database name — used by Docker Compose (default: `cad_annotator`)                  |
| `CORS_ORIGIN`                     | Allowed frontend origin for CORS, e.g. `https://app.example.com` (**required in production**) |

Frontend-specific (set in each artifact's `.env`):

| Variable    | Description                  |
| ----------- | ---------------------------- |
| `PORT`      | Dev server port              |
| `BASE_PATH` | URL base path (default: `/`) |

### 3. Generate API client code (if modifying the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

### 4. Run in development

Start the API server and frontend in separate terminals:

```bash
# Terminal 1: API server
pnpm --filter @workspace/api-server run dev

# Terminal 2: Frontend
pnpm --filter @workspace/cad-annotator run dev
```

### 5. Build for production

```bash
pnpm run build
```

This runs type checking across all packages, then builds each artifact:

- API server → `artifacts/api-server/dist/index.mjs`
- Frontend → `artifacts/cad-annotator/dist/public/`

### 6. Run in production

```bash
# API server
node --enable-source-maps artifacts/api-server/dist/index.mjs

# Frontend (serve the static build with any HTTP server)
npx serve artifacts/cad-annotator/dist/public
```

## Model Configuration

The system uses two separate model settings so you can pair a capable vision model with a lighter text model:

| Variable       | Purpose                        | Default       | Requirements         |
| -------------- | ------------------------------ | ------------- | -------------------- |
| `OPENAI_MODEL` | Annotation detection (Stage 1) | `gpt-4o`      | Must support vision  |
| `DFM_MODEL`    | DFM manufacturability review   | `gpt-4o-mini` | Text-only, any model |

`OPENAI_MODEL` is used by the pipeline orchestrator and re-query service for image analysis. `DFM_MODEL` is used by the DFM reviewer for text-based manufacturability feedback. Using `gpt-4o-mini` for DFM keeps costs down without sacrificing quality on text tasks.

## SQLite Fallback

When `DATABASE_URL` is **not set**, the database layer automatically falls back to SQLite, storing data in a local `cad-annotator.db` file. No PostgreSQL setup required.

```bash
# Just run the dev server — SQLite is used automatically
pnpm --filter @workspace/api-server run dev
```

When `DATABASE_URL` **is set** (e.g., via Docker Compose or manually), PostgreSQL is used instead. The `db` interface is identical in both modes — no code changes needed.

## Local LLM Setup

An LLM backend is **always required** — either an external API (OpenAI, Azure, etc.) or a local model server. The system is compatible with any OpenAI-compatible API.

### Compatible Models

| Use Case             | Recommended Model | Notes                                 |
| -------------------- | ----------------- | ------------------------------------- |
| Annotation detection | LLaVA             | Must support vision/image input       |
| DFM review           | Any chat model    | Text-only — Llama, Mistral, etc. work |

### Ollama Setup

1. Install [Ollama](https://ollama.com) and pull a vision model:

   ```bash
   ollama pull llava
   ```

2. Start the full stack with the local LLM profile:

   ```bash
   docker compose --profile local-llm up
   ```

   This starts Ollama alongside the app and database. GPU passthrough is configured for NVIDIA GPUs.

3. If running Ollama outside Docker, point the base URL to it in your `.env`:

   ```dotenv
   AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:11434/v1
   AI_INTEGRATIONS_OPENAI_API_KEY=ollama
   ```

### LM Studio Setup

1. Start [LM Studio](https://lmstudio.ai) and load a compatible model
2. Enable the local server (LM Studio exposes an OpenAI-compatible endpoint)
3. Update your `.env`:

   ```dotenv
   AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:1234/v1
   AI_INTEGRATIONS_OPENAI_API_KEY=lm-studio
   ```

### Environment Variable Reference

| Variable                          | Description                                    | Default                     |
| --------------------------------- | ---------------------------------------------- | --------------------------- |
| `AI_INTEGRATIONS_OPENAI_API_KEY`  | API key for the LLM provider                   | _(required)_                |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Base URL for OpenAI-compatible API             | `https://api.openai.com/v1` |
| `OPENAI_MODEL`                    | Vision model for annotation detection          | `gpt-4o`                    |
| `DFM_MODEL`                       | Text model for DFM review                      | `gpt-4o-mini`               |
| `DATABASE_URL`                    | PostgreSQL connection string (omit for SQLite) | _(unset — SQLite fallback)_ |

## API Endpoints

| Method | Path           | Description                 |
| ------ | -------------- | --------------------------- |
| `GET`  | `/api/healthz` | Health check                |
| `POST` | `/api/analyze` | Analyze a CAD drawing image |

See `lib/api-spec/openapi.yaml` for the full OpenAPI specification.

## Project Scripts

| Script                                          | Description                                       |
| ----------------------------------------------- | ------------------------------------------------- |
| `pnpm run build`                                | Type-check and build all artifacts                |
| `pnpm run typecheck`                            | Run TypeScript type checking across the workspace |
| `pnpm --filter <package> run dev`               | Start a specific artifact in dev mode             |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API client from OpenAPI spec           |
| `pnpm --filter @workspace/db run push`          | Push database schema changes                      |

## License

Apache 2.0
