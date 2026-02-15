import { describe, it, expect } from "vitest";
import {
  createOAuthSessionCookie,
  getOAuthSessionFromCookie,
  createUserSessionCookie,
  getUserSessionFromCookie,
  getSessionFromCookie,
  verifySignedId,
} from "../session";
import type { OAuthSession, UserSession } from "../session";

const sampleOAuthSession: OAuthSession = {
  state: "test-state",
  codeVerifier: "test-verifier",
  dpopPrivateJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
  tokenEndpoint: "https://pds.example.com/oauth/token",
  email: "test@example.com",
  expectedDid: "did:plc:test123",
  expectedPdsUrl: "https://pds.example.com",
};

const sampleUserSession: UserSession = {
  userDid: "did:plc:test123",
  userHandle: "test.example.com",
  createdAt: Date.now(),
};

function mockCookieStore(cookies: Record<string, string>) {
  return {
    get: (name: string) =>
      cookies[name] ? { value: cookies[name] } : undefined,
  };
}

describe("signed cookie payloads", () => {
  it("creates signed OAuth cookie values", () => {
    const cookie = createOAuthSessionCookie(sampleOAuthSession);
    expect(cookie.name).toBe("oauth_state");
    expect(cookie.value).toContain(".");
  });

  it("creates signed user session cookie values", () => {
    const cookie = createUserSessionCookie(sampleUserSession);
    expect(cookie.name).toBe("session_id");
    expect(cookie.value).toContain(".");
  });

  it("rejects tampered values", () => {
    const cookie = createUserSessionCookie(sampleUserSession);
    const tampered =
      cookie.value.slice(0, -1) + (cookie.value.endsWith("a") ? "b" : "a");
    const store = mockCookieStore({ session_id: tampered });
    expect(getUserSessionFromCookie(store)).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(verifySignedId("no-dot-here")).toBeNull();
    expect(verifySignedId("")).toBeNull();
  });
});

describe("OAuth session cookies", () => {
  it("roundtrips OAuth session data", () => {
    const cookie = createOAuthSessionCookie(sampleOAuthSession);
    const store = mockCookieStore({ [cookie.name]: cookie.value });
    const retrieved = getOAuthSessionFromCookie(store);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.state).toBe("test-state");
    expect(retrieved!.codeVerifier).toBe("test-verifier");
    expect(retrieved!.expectedDid).toBe("did:plc:test123");
    expect(retrieved!.email).toBe("test@example.com");
  });

  it("returns null when no cookie", () => {
    const store = mockCookieStore({});
    expect(getOAuthSessionFromCookie(store)).toBeNull();
  });

  it("returns null for invalid cookie", () => {
    const store = mockCookieStore({ oauth_state: "bad.signature" });
    expect(getOAuthSessionFromCookie(store)).toBeNull();
  });
});

describe("user session cookies", () => {
  it("roundtrips user session data", () => {
    const cookie = createUserSessionCookie(sampleUserSession);
    const store = mockCookieStore({ [cookie.name]: cookie.value });
    const retrieved = getUserSessionFromCookie(store);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userDid).toBe("did:plc:test123");
    expect(retrieved!.userHandle).toBe("test.example.com");
  });

  it("returns null when no cookie", () => {
    const store = mockCookieStore({});
    expect(getUserSessionFromCookie(store)).toBeNull();
  });

  it("returns null for invalid cookie", () => {
    const store = mockCookieStore({ session_id: "bad.signature" });
    expect(getUserSessionFromCookie(store)).toBeNull();
  });
});

describe("getSessionFromCookie", () => {
  it("returns session when valid cookie exists", async () => {
    const cookie = createUserSessionCookie(sampleUserSession);
    const store = mockCookieStore({ [cookie.name]: cookie.value });
    const session = await getSessionFromCookie(store);
    expect(session).not.toBeNull();
    expect(session!.userDid).toBe("did:plc:test123");
  });

  it("returns null when no cookie", async () => {
    const store = mockCookieStore({});
    const session = await getSessionFromCookie(store);
    expect(session).toBeNull();
  });
});
