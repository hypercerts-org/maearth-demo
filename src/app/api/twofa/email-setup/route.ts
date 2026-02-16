import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import { validateEmail } from "@/lib/validation";
import {
  generateEmailOtp,
  sendEmailOtp,
  savePendingCode,
  verifyPendingCode,
  saveTwoFactorConfig,
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

  let body: { step?: string; email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { step } = body;

  if (step === "send") {
    const email = (body.email || "").trim();
    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const code = generateEmailOtp();
    await savePendingCode(session.userDid, code, "email-setup", email);
    await sendEmailOtp(email, code);

    return NextResponse.json({ success: true });
  }

  if (step === "verify") {
    const code = (body.code || "").trim();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const result = await verifyPendingCode(session.userDid, code);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
    }

    await saveTwoFactorConfig(session.userDid, {
      method: "email",
      email: result.email,
      enabledAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
