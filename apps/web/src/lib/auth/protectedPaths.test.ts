import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./protectedPaths";

describe("isProtectedPath — accès à une route protégée", () => {
  it.each([
    "/dashboard",
    "/sources",
    "/ingestions",
    "/sources/abc-123",
    "/ingestions/abc-123",
    "/api/sources",
    "/api/sources/abc-123/schema-versions",
  ])("%s est protégé", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/api/auth/session", "/sources-public"])(
    "%s n'est pas protégé",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );
});
