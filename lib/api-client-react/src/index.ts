/**
 * API Client (React)
 *
 * Public API for the generated React Query hooks and TypeScript types.
 * Also exports configuration functions for setting the API base URL
 * and authentication token getter.
 *
 * Generated from the OpenAPI spec via Orval — do not edit the files
 * in `./generated/` directly. Run `pnpm --filter @workspace/api-spec run codegen`
 * to regenerate.
 */
export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
