import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import {
  getAndDeleteChallenge,
  savePasskeyCredential,
  saveTwoFactorConfig,
} from "@/lib/twofa";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getBaseUrl } from "@/lib/auth";

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

  const challenge = await getAndDeleteChallenge(session.userDid);
  if (!challenge) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const baseUrl = getBaseUrl();
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(baseUrl).hostname;
  const expectedOrigin = process.env.WEBAUTHN_ORIGIN || baseUrl;

  try {
    const verification = await verifyRegistrationResponse({
      response: body as unknown as Parameters<
        typeof verifyRegistrationResponse
      >[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 400 },
      );
    }

    const { credential } = verification.registrationInfo;

    await savePasskeyCredential(session.userDid, {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: (body.response as { transports?: string[] })?.transports,
    });

    await saveTwoFactorConfig(session.userDid, {
      method: "passkey",
      enabledAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[twofa] Passkey registration error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 400 });
  }
}
