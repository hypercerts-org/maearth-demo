import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getSessionFromCookie,
  createUserSessionCookie,
} from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  getTwoFactorConfig,
  deleteTwoFactorConfig,
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

  const rl = await checkRateLimit(`twofa:${session.userDid}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = await getTwoFactorConfig(session.userDid);
  if (!config) {
    return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // For TOTP and email, require current code to disable
  if (config.method === "totp") {
    const code = (body.code || "").trim();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }
    if (!config.totpSecret || !verifyTotpCode(config.totpSecret, code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
  } else if (config.method === "email") {
    const code = (body.code || "").trim();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }
    const result = await verifyPendingCode(session.userDid, code);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid code" },
        { status: 400 },
      );
    }
  }
  // Passkey: no code needed (already authenticated via session)

  await deleteTwoFactorConfig(session.userDid);

  // Refresh session cookie without 2FA flag concerns
  const newCookie = createUserSessionCookie({
    userDid: session.userDid,
    userHandle: session.userHandle,
    createdAt: session.createdAt,
    verified: true,
  });

  cookieStore.set(newCookie.name, newCookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  return NextResponse.json({ success: true });
}
