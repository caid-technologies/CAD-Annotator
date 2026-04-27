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

## Getting Started

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

| Variable                          | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `PORT`                            | API server port (default: `8080`)                          |
| `AI_INTEGRATIONS_OPENAI_API_KEY`  | Your OpenAI API key                                        |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI API base URL (default: `https://api.openai.com/v1`) |
| `DATABASE_URL`                    | PostgreSQL connection string (optional, for DB features)   |

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

MIT
