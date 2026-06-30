// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost${pathname}`));
}

describe("middleware terminal endpoint bypass", () => {
  afterEach(() => {
    delete process.env.DEVDECK_TOKEN;
  });

  it.each(["/api/terminal", "/api/terminal/workspace"])(
    "lets %s through so the terminal server handles WebSocket auth",
    (pathname) => {
      process.env.DEVDECK_TOKEN = "secret";

      const response = middleware(request(pathname));

      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("still protects other API routes when a token is configured", async () => {
    process.env.DEVDECK_TOKEN = "secret";

    const response = middleware(request("/api/projects"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
