/**
 * Orval Code Generation Configuration
 *
 * Generates two outputs from the OpenAPI specification (`openapi.yaml`):
 *
 * 1. **api-client-react** — TanStack React Query hooks + TypeScript types
 *    for calling the API from the frontend. Uses a custom fetch wrapper
 *    that supports base URL configuration and auth token injection.
 *
 * 2. **api-zod** — Zod validation schemas for request/response bodies,
 *    used on the server side to validate incoming requests.
 *
 * Run: `pnpm --filter @workspace/api-spec run codegen`
 */
import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

/**
 * Normalise the API title to "Api" so the generated output files are
 * always named `api.ts` / `api.schemas.ts`. This keeps import paths stable
 * regardless of what title is set in the OpenAPI spec.
 */
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";
  return config;
};

export default defineConfig({
  /* ---- React Query hooks ---- */
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },

  /* ---- Zod validation schemas ---- */
  zod: {
    input: {
      target: "./openapi.yaml",
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated/api.ts",
      clean: false,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
            body: ["bigint", "date"],
            response: ["bigint", "date"],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
