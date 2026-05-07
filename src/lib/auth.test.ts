// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import {
  generateToken,
  getToken,
  validateToken,
  constantTimeEqual,
  parseCookieToken,
} from "./auth";

describe("auth", () => {
  const originalEnv = process.env.DEVDECK_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEVDECK_TOKEN = originalEnv;
    } else {
      delete process.env.DEVDECK_TOKEN;
    }
  });

  describe("generateToken", () => {
    it("returns a valid UUID string", () => {
      const token = generateToken();
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("generates unique tokens", () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateToken()));
      expect(tokens.size).toBe(10);
    });
  });

  describe("getToken", () => {
    it("returns null when DEVDECK_TOKEN is not set", () => {
      delete process.env.DEVDECK_TOKEN;
      expect(getToken()).toBeNull();
    });

    it("returns null when DEVDECK_TOKEN is empty", () => {
      process.env.DEVDECK_TOKEN = "";
      expect(getToken()).toBeNull();
    });

    it("returns null when DEVDECK_TOKEN is whitespace", () => {
      process.env.DEVDECK_TOKEN = "   ";
      expect(getToken()).toBeNull();
    });

    it("returns the token when set", () => {
      process.env.DEVDECK_TOKEN = "test-token-123";
      expect(getToken()).toBe("test-token-123");
    });
  });

  describe("validateToken", () => {
    it("returns true when no expected token (auth disabled)", () => {
      expect(validateToken("anything", null)).toBe(true);
      expect(validateToken(null, null)).toBe(true);
      expect(validateToken(null, undefined)).toBe(true);
    });

    it("returns false when expected but no provided token", () => {
      expect(validateToken(null, "secret")).toBe(false);
      expect(validateToken(undefined, "secret")).toBe(false);
    });

    it("returns true for matching tokens", () => {
      expect(validateToken("my-token", "my-token")).toBe(true);
    });

    it("returns false for mismatched tokens", () => {
      expect(validateToken("wrong", "right")).toBe(false);
    });

    it("returns false for different-length tokens", () => {
      expect(validateToken("short", "much-longer-token")).toBe(false);
    });

    it("handles unicode tokens", () => {
      expect(validateToken("tökën-🔑", "tökën-🔑")).toBe(true);
      expect(validateToken("tökën-🔑", "tökën-🔒")).toBe(false);
    });
  });

  describe("constantTimeEqual", () => {
    it("returns true for equal strings", () => {
      expect(constantTimeEqual("hello", "hello")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(constantTimeEqual("hello", "world")).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(constantTimeEqual("short", "longer-string")).toBe(false);
    });

    it("returns true for empty strings", () => {
      expect(constantTimeEqual("", "")).toBe(true);
    });

    it("does not throw on any input", () => {
      expect(() => constantTimeEqual("a", "b")).not.toThrow();
      expect(() => constantTimeEqual("", "x")).not.toThrow();
    });
  });

  describe("parseCookieToken", () => {
    it("returns null for null/undefined input", () => {
      expect(parseCookieToken(null)).toBeNull();
      expect(parseCookieToken(undefined)).toBeNull();
    });

    it("returns null when token cookie not present", () => {
      expect(parseCookieToken("other=value")).toBeNull();
    });

    it("extracts token from single cookie", () => {
      expect(parseCookieToken("devdeck_token=abc123")).toBe("abc123");
    });

    it("extracts token from multiple cookies", () => {
      expect(parseCookieToken("foo=bar; devdeck_token=abc123; baz=qux")).toBe("abc123");
    });

    it("handles URL-encoded values", () => {
      expect(parseCookieToken("devdeck_token=abc%20123")).toBe("abc 123");
    });
  });
});
