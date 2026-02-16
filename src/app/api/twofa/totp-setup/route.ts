import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  generateTotpSecret,
  getTotpUri,
  verifyTotpCode,
  saveTwoFactorConfig,
  savePendingTotpSecret,
  getPendingTotpSecret,
  deletePendingTotpSecret,
} from "@/lib/twofa";
import QRCode from "qrcode";

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

  let body: { step?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { step, code } = body;

  if (step === "init") {
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, session.userHandle);
    const qrCodeSvg = await QRCode.toString(uri, {
      type: "svg",
      width: 200,
      margin: 1,
    });

    // Store secret for verification step
    await savePendingTotpSecret(session.userDid, secret);

    return NextResponse.json({ qrCodeSvg, secret });
  }

  if (step === "verify") {
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const secret = await getPendingTotpSecret(session.userDid);
    if (!secret) {
      return NextResponse.json(
        { error: "Setup expired, please start again" },
        { status: 400 },
      );
    }

    if (!verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Save permanent config
    await saveTwoFactorConfig(session.userDid, {
      method: "totp",
      totpSecret: secret,
      enabledAt: Date.now(),
    });
    await deletePendingTotpSecret(session.userDid);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
