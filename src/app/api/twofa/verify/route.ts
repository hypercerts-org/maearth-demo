import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getSessionFromCookie,
  createUserSessionCookie,
  SESSION_COOKIE,
} from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  getTwoFactorConfig,
  verifyTotpCode,
  verifyPendingCode,
} from "@/lib/twofa";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !validateCsrfToken(csrf)) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const rl = await checkRateLimit(`twofa-verify:${session.userDid}`, 5, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body.code || "").trim();
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const config = await getTwoFactorConfig(session.userDid);
  if (!config) {
    return NextResponse.json({ error: "2FA not configured" }, { status: 400 });
  }

  let valid = false;

  if (config.method === "totp" && config.totpSecret) {
    valid = verifyTotpCode(config.totpSecret, code);
  } else if (config.method === "email") {
    const result = await verifyPendingCode(session.userDid, code);
    valid = result.success;
    if (!valid) {
      return NextResponse.json(
        { error: result.error || "Invalid code" },
        { status: 400 },
      );
    }
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  // Upgrade session to verified
  const verifiedCookie = createUserSessionCookie({
    userDid: session.userDid,
    userHandle: session.userHandle,
    createdAt: session.createdAt,
    verified: true,
  });

  cookieStore.set(verifiedCookie.name, verifiedCookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  return NextResponse.json({ success: true });
}
