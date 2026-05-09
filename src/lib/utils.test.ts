import { describe, it, expect } from "vitest";
import { languageColor } from "./utils";

describe("languageColor (T1)", () => {
  it('returns "bg-blue-500" for TypeScript', () => {
    expect(languageColor("TypeScript")).toBe("bg-blue-500");
  });

  it('returns "bg-yellow-500" for JavaScript', () => {
    expect(languageColor("JavaScript")).toBe("bg-yellow-500");
  });

  it('returns "bg-green-500" for Python', () => {
    expect(languageColor("Python")).toBe("bg-green-500");
  });

  it('returns "bg-orange-500" for Rust', () => {
    expect(languageColor("Rust")).toBe("bg-orange-500");
  });

  it('returns "bg-cyan-500" for Go', () => {
    expect(languageColor("Go")).toBe("bg-cyan-500");
  });

  it('returns "bg-red-500" for Ruby', () => {
    expect(languageColor("Ruby")).toBe("bg-red-500");
  });

  it('returns "bg-amber-700" for Java', () => {
    expect(languageColor("Java")).toBe("bg-amber-700");
  });

  it('returns "bg-muted-foreground" for undefined', () => {
    expect(languageColor(undefined)).toBe("bg-muted-foreground");
  });

  it('returns "bg-muted-foreground" for unknown language', () => {
    expect(languageColor("UnknownLang")).toBe("bg-muted-foreground");
  });
});
