import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  getTwoFactorConfig,
  generateEmailOtp,
  sendEmailOtp,
  savePendingCode,
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

  const rl = await checkRateLimit(
    `twofa-email:${session.userDid}`,
    3,
    60000,
  );
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = await getTwoFactorConfig(session.userDid);
  if (!config || config.method !== "email" || !config.email) {
    return NextResponse.json(
      { error: "Email 2FA not configured" },
      { status: 400 },
    );
  }

  const code = generateEmailOtp();
  await savePendingCode(session.userDid, code, "email-verify", config.email);
  await sendEmailOtp(config.email, code);

  return NextResponse.json({ success: true });
}
