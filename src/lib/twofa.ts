import * as crypto from "crypto";
import { Redis } from "@upstash/redis";
import { TOTP, Secret } from "otpauth";
import * as nodemailer from "nodemailer";

// --- Redis client ---

let redis: Redis | null = null;
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function requireRedis(): Redis {
  if (!redis) {
    throw new Error("2FA requires Upstash Redis to be configured");
  }
  return redis;
}

// --- Types ---

export interface TwoFactorConfig {
  method: "totp" | "email" | "passkey";
  email?: string;
  totpSecret?: string;
  enabledAt: number;
}

export interface PasskeyCredential {
  credentialId: string;
  publicKey: string; // base64url-encoded
  counter: number;
  transports?: string[];
}

interface PendingVerification {
  codeHash: string;
  type: "totp-setup" | "email-setup" | "email-verify";
  expiresAt: number;
  attempts: number;
  email?: string;
}

// --- Config Storage ---

const CONFIG_KEY = (did: string) => `twofa:${did}`;
const CREDENTIALS_KEY = (did: string) => `twofa:credentials:${did}`;
const CHALLENGE_KEY = (did: string) => `twofa:challenge:${did}`;
const PENDING_KEY = (did: string) => `twofa:pending:${did}`;

export async function getTwoFactorConfig(
  did: string,
): Promise<TwoFactorConfig | null> {
  const r = requireRedis();
  const data = await r.get<string>(CONFIG_KEY(did));
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

export async function saveTwoFactorConfig(
  did: string,
  config: TwoFactorConfig,
): Promise<void> {
  const r = requireRedis();
  await r.set(CONFIG_KEY(did), JSON.stringify(config));
}

export async function deleteTwoFactorConfig(did: string): Promise<void> {
  const r = requireRedis();
  await r.del(CONFIG_KEY(did));
  await r.del(CREDENTIALS_KEY(did));
}

export async function hasTwoFactorEnabled(did: string): Promise<boolean> {
  if (!redis) return false;
  const config = await getTwoFactorConfig(did);
  return config !== null;
}

// --- TOTP ---

export function generateTotpSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

export function getTotpUri(secret: string, handle: string): string {
  const totp = new TOTP({
    issuer: "Ma Earth",
    label: handle,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({
    issuer: "Ma Earth",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// --- Email OTP ---

export function generateEmailOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "noreply@maearth.com";

  if (!host || !user || !pass) {
    console.log(`[2fa] Email OTP for ${email}: ${code}`);
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: `"Ma Earth" <${from}>`,
    to: email,
    subject: `${code} — Your Ma Earth verification code`,
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1A130F; margin-bottom: 8px;">Ma Earth</h2>
        <p style="color: #6b6b6b;">Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1A130F; padding: 16px 0; font-family: monospace;">${code}</div>
        <p style="color: #999; font-size: 13px;">This code expires in 10 minutes.</p>
      </div>
    `,
  });
}

// --- Pending Verification ---

const PENDING_TTL = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

export async function savePendingCode(
  did: string,
  code: string,
  type: PendingVerification["type"],
  email?: string,
): Promise<void> {
  const r = requireRedis();
  const pending: PendingVerification = {
    codeHash: hashCode(code),
    type,
    expiresAt: Date.now() + PENDING_TTL * 1000,
    attempts: 0,
    email,
  };
  await r.set(PENDING_KEY(did), JSON.stringify(pending), { ex: PENDING_TTL });
}

export async function verifyPendingCode(
  did: string,
  code: string,
): Promise<{ success: boolean; error?: string; email?: string }> {
  const r = requireRedis();
  const raw = await r.get<string>(PENDING_KEY(did));
  if (!raw)
    return { success: false, error: "No pending verification or code expired" };

  const pending: PendingVerification =
    typeof raw === "string" ? JSON.parse(raw) : raw;

  if (Date.now() > pending.expiresAt) {
    await r.del(PENDING_KEY(did));
    return { success: false, error: "Code expired" };
  }

  if (pending.attempts >= MAX_ATTEMPTS) {
    await r.del(PENDING_KEY(did));
    return { success: false, error: "Too many attempts" };
  }

  const providedHash = hashCode(code);
  const match =
    providedHash.length === pending.codeHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(providedHash),
      Buffer.from(pending.codeHash),
    );

  if (!match) {
    pending.attempts++;
    await r.set(PENDING_KEY(did), JSON.stringify(pending), {
      ex: Math.ceil((pending.expiresAt - Date.now()) / 1000),
    });
    return { success: false, error: "Invalid code" };
  }

  await r.del(PENDING_KEY(did));
  return { success: true, email: pending.email };
}

export async function deletePendingCode(did: string): Promise<void> {
  const r = requireRedis();
  await r.del(PENDING_KEY(did));
}

// --- TOTP Setup (stores secret retrievably for enrollment verification) ---

const TOTP_SETUP_KEY = (did: string) => `twofa:totp-setup:${did}`;

export async function savePendingTotpSecret(
  did: string,
  secret: string,
): Promise<void> {
  const r = requireRedis();
  await r.set(TOTP_SETUP_KEY(did), secret, { ex: PENDING_TTL });
}

export async function getPendingTotpSecret(
  did: string,
): Promise<string | null> {
  const r = requireRedis();
  return await r.get<string>(TOTP_SETUP_KEY(did));
}

export async function deletePendingTotpSecret(did: string): Promise<void> {
  const r = requireRedis();
  await r.del(TOTP_SETUP_KEY(did));
}

// --- Passkey / WebAuthn ---

export async function getPasskeyCredentials(
  did: string,
): Promise<PasskeyCredential[]> {
  const r = requireRedis();
  const raw = await r.get<string>(CREDENTIALS_KEY(did));
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function savePasskeyCredential(
  did: string,
  credential: PasskeyCredential,
): Promise<void> {
  const r = requireRedis();
  const existing = await getPasskeyCredentials(did);
  existing.push(credential);
  await r.set(CREDENTIALS_KEY(did), JSON.stringify(existing));
}

export async function updatePasskeyCounter(
  did: string,
  credentialId: string,
  newCounter: number,
): Promise<void> {
  const r = requireRedis();
  const credentials = await getPasskeyCredentials(did);
  const cred = credentials.find((c) => c.credentialId === credentialId);
  if (cred) {
    cred.counter = newCounter;
    await r.set(CREDENTIALS_KEY(did), JSON.stringify(credentials));
  }
}

export async function saveChallenge(
  did: string,
  challenge: string,
): Promise<void> {
  const r = requireRedis();
  await r.set(CHALLENGE_KEY(did), challenge, { ex: 120 });
}

export async function getAndDeleteChallenge(
  did: string,
): Promise<string | null> {
  const r = requireRedis();
  const challenge = await r.get<string>(CHALLENGE_KEY(did));
  if (challenge) await r.del(CHALLENGE_KEY(did));
  return challenge;
}
