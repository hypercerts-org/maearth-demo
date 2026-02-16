import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import {
  getBaseUrl,
  restoreDpopKeyPair,
  createDpopProof,
  resolveDidToPds,
  TOKEN_ENDPOINT,
  PLC_DIRECTORY_URL,
} from "@/lib/auth";
import { cookies } from "next/headers";
import {
  getOAuthSessionFromCookie,
  createUserSessionCookie,
  SESSION_COOKIE,
  OAUTH_COOKIE,
} from "@/lib/session";
import { sanitizeForLog } from "@/lib/validation";
import { hasTwoFactorEnabled } from "@/lib/twofa";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      console.error("[oauth/callback] Auth error from PDS");
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    // Retrieve OAuth session from signed cookie
    const cookieStore = await cookies();
    const stateData = getOAuthSessionFromCookie(cookieStore);
    if (!stateData) {
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    if (stateData.state !== state) {
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    const codeVerifier = stateData.codeVerifier;
    const tokenUrl = stateData.tokenEndpoint || TOKEN_ENDPOINT;

    const clientId = `${baseUrl}/client-metadata.json`;
    const redirectUri = `${baseUrl}/api/oauth/callback`;

    // Exchange code for tokens with DPoP
    if (!stateData.dpopPrivateJwk) {
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }
    const { privateKey, publicJwk } = restoreDpopKeyPair(
      stateData.dpopPrivateJwk as crypto.JsonWebKey,
    );

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    // First attempt
    let dpopProof = createDpopProof({
      privateKey,
      jwk: publicJwk,
      method: "POST",
      url: tokenUrl,
    });

    let tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: dpopProof,
      },
      body: tokenBody.toString(),
    });

    // Handle DPoP nonce requirement
    if (!tokenRes.ok) {
      const dpopNonce = tokenRes.headers.get("dpop-nonce");
      if (dpopNonce) {
        console.log("[oauth/callback] Retrying token exchange with DPoP nonce");
        dpopProof = createDpopProof({
          privateKey,
          jwk: publicJwk,
          method: "POST",
          url: tokenUrl,
          nonce: dpopNonce,
        });

        tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            DPoP: dpopProof,
          },
          body: tokenBody.toString(),
        });
      }
    }

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      console.error(
        "[oauth/callback] Token exchange failed:",
        tokenRes.status,
        errBody,
      );
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      sub: string;
      scope?: string;
    };

    console.log(
      "[oauth/callback] Token exchange successful, sub:",
      tokenData.sub,
    );

    // Validate sub matches expected DID (blocks malicious PDS impersonation)
    if (stateData.expectedDid && tokenData.sub !== stateData.expectedDid) {
      console.error(
        "[oauth/callback] DID mismatch: token sub does not match expected DID",
      );
      return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
    }

    // Validate token endpoint origin matches expected PDS
    if (stateData.expectedPdsUrl) {
      const tokenOrigin = new URL(tokenUrl).origin;
      const expectedOrigin = new URL(stateData.expectedPdsUrl).origin;
      if (tokenOrigin !== expectedOrigin) {
        console.error(
          "[oauth/callback] Issuer mismatch: token endpoint",
          tokenOrigin,
          "vs expected",
          expectedOrigin,
        );
        return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
      }
    }

    // For email login: verify the returned DID's PDS matches our token endpoint
    // This prevents a compromised PDS from claiming arbitrary DIDs
    if (!stateData.expectedDid && tokenData.sub) {
      try {
        const didPdsUrl = await resolveDidToPds(tokenData.sub);
        const didPdsOrigin = new URL(didPdsUrl).origin;
        const tokenOrigin = new URL(tokenUrl).origin;
        if (didPdsOrigin !== tokenOrigin) {
          console.error(
            "[oauth/callback] Email flow: DID PDS mismatch -",
            didPdsOrigin,
            "vs",
            tokenOrigin,
          );
          return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
        }
      } catch (err) {
        console.error(
          "[oauth/callback] Email flow: Could not verify DID PDS ownership:",
          err instanceof Error ? err.message : err,
        );
        return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
      }
    }

    console.log(
      "[oauth/callback] Authentication successful for",
      sanitizeForLog(tokenData.sub),
    );

    // Resolve handle from DID via PLC directory (no auth needed)
    let handle = tokenData.sub;
    try {
      const plcRes = await fetch(`${PLC_DIRECTORY_URL}/${tokenData.sub}`);
      if (plcRes.ok) {
        const plcData = (await plcRes.json()) as { alsoKnownAs?: string[] };
        const atUri = plcData.alsoKnownAs?.find((u: string) =>
          u.startsWith("at://"),
        );
        if (atUri) {
          handle = atUri.replace("at://", "");
        }
      }
    } catch {
      console.warn("[oauth/callback] Could not resolve handle from PLC");
    }

    // Check if user has 2FA enabled
    const has2fa = await hasTwoFactorEnabled(tokenData.sub);

    // Create signed user session cookie
    const userCookie = createUserSessionCookie({
      userDid: tokenData.sub,
      userHandle: handle,
      createdAt: Date.now(),
      verified: !has2fa, // false if 2FA required, true otherwise
    });

    // Delete OAuth cookie, set user session cookie
    cookieStore.delete(OAUTH_COOKIE);
    cookieStore.set(userCookie.name, userCookie.value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    // Provision wallet (fire-and-forget, don't block login)
    if (
      process.env.WALLET_SERVICE_URL &&
      process.env.WALLET_API_KEY &&
      stateData.email
    ) {
      fetch(`${process.env.WALLET_SERVICE_URL}/wallet/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.WALLET_API_KEY,
        },
        body: JSON.stringify({ email: stateData.email, did: tokenData.sub }),
      }).catch(() => console.warn("[oauth/callback] Wallet provision failed"));
    }

    // Redirect to 2FA verification or welcome
    const redirectPath = has2fa ? "/verify-2fa" : "/welcome";
    return NextResponse.redirect(new URL(redirectPath, baseUrl));
  } catch (err) {
    console.error(
      "[oauth/callback] Error:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
