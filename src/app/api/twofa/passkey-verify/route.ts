import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie, createUserSessionCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import {
  getAndDeleteChallenge,
  getPasskeyCredentials,
  updatePasskeyCounter,
} from "@/lib/twofa";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
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

  const credentials = await getPasskeyCredentials(session.userDid);
  const credential = credentials.find((c) => c.credentialId === body.id);
  if (!credential) {
    return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
  }

  const baseUrl = getBaseUrl();
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(baseUrl).hostname;
  const expectedOrigin = process.env.WEBAUTHN_ORIGIN || baseUrl;

  try {
    const verification = await verifyAuthenticationResponse({
      response: body as unknown as Parameters<
        typeof verifyAuthenticationResponse
      >[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, "base64url"),
        counter: credential.counter,
        transports: credential.transports as
          | ("ble" | "hybrid" | "internal" | "nfc" | "usb")[]
          | undefined,
      },
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 400 },
      );
    }

    // Update counter
    await updatePasskeyCounter(
      session.userDid,
      credential.credentialId,
      verification.authenticationInfo.newCounter,
    );

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
  } catch (err) {
    console.error("[twofa] Passkey auth error:", err);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 400 },
    );
  }
}
