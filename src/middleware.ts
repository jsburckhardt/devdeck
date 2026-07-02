import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(request: NextRequest) {
  const token = process.env.DEVDECK_TOKEN;

  // No auth configured — allow all requests
  if (!token || token.trim() === "") {
    return NextResponse.next();
  }

  // Skip WebSocket terminal endpoint — terminal server handles its own auth
  if (request.nextUrl.pathname === "/api/terminal") {
    return NextResponse.next();
  }

  // Check cookie
  const cookieToken = request.cookies.get("devdeck_token")?.value;
  if (cookieToken && constantTimeEqual(cookieToken, token)) {
    return NextResponse.next();
  }

  // Check query param — set cookie and redirect to strip token from URL
  const urlToken = request.nextUrl.searchParams.get("token");
  if (urlToken && constantTimeEqual(urlToken, token)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set("devdeck_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: request.nextUrl.protocol === "https:",
    });
    response.cookies.set("devdeck_token_client", token, {
      sameSite: "lax",
      path: "/",
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }

  // Unauthorized
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>DevDeck — Access Denied</title></head>
<body style="font-family:monospace;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;">
    <h1 style="font-size:1.5rem;">&#128274; Access Denied</h1>
    <p style="color:#a6adc8;">Please use the URL with token printed at startup.</p>
  </div>
</body>
</html>`,
    { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
