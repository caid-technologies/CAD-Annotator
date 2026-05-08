/**
 * Unit Tests: Database Adapter Dialect Selection
 *
 * Verifies that the adapter selects the correct dialect based on the
 * `DATABASE_URL` environment variable.
 */
import { describe, it, expect, afterEach } from "vitest";
import { detectDialect } from "./adapter";

describe("detectDialect", () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("returns 'postgresql' when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
    expect(detectDialect()).toBe("postgresql");
  });

  it("returns 'sqlite' when DATABASE_URL is not set", () => {
    delete process.env.DATABASE_URL;
    expect(detectDialect()).toBe("sqlite");
  });

  it("returns 'sqlite' when DATABASE_URL is empty string", () => {
    process.env.DATABASE_URL = "";
    expect(detectDialect()).toBe("sqlite");
  });

  it("returns 'postgresql' for any non-empty DATABASE_URL value", () => {
    process.env.DATABASE_URL = "postgres://db:5432/mydb";
    expect(detectDialect()).toBe("postgresql");
  });
});
