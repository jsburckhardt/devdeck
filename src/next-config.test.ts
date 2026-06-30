// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("next terminal rewrites", () => {
  it("routes default and workspace terminal WebSocket paths to the terminal server", async () => {
    const rewrites = await (config as { rewrites: () => Promise<unknown[]> }).rewrites();

    expect(rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/terminal",
          destination: "http://127.0.0.1:3100/api/terminal",
        },
        {
          source: "/api/terminal/:path*",
          destination: "http://127.0.0.1:3100/api/terminal/:path*",
        },
      ]),
    );
  });
});
