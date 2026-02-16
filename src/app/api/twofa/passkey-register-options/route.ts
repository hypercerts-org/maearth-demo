import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import { getPasskeyCredentials, saveChallenge } from "@/lib/twofa";
import { generateRegistrationOptions } from "@simplewebauthn/server";
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

  const rl = await checkRateLimit(`twofa:${session.userDid}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rpID =
    process.env.WEBAUTHN_RP_ID || new URL(getBaseUrl()).hostname;
  const rpName = process.env.WEBAUTHN_RP_NAME || "Ma Earth";

  const existingCredentials = await getPasskeyCredentials(session.userDid);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(session.userDid),
    userName: session.userHandle,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  });

  await saveChallenge(session.userDid, options.challenge);

  return NextResponse.json(options);
}

type AuthenticatorTransport = "ble" | "hybrid" | "internal" | "nfc" | "usb";
