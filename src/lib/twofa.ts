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

export type TwoFactorMethod = "totp" | "email" | "passkey";

export interface TotpMethodConfig {
  type: "totp";
  secret: string;
  enabledAt: number;
}

export interface EmailMethodConfig {
  type: "email";
  address: string;
  enabledAt: number;
}

export interface PasskeyMethodConfig {
  type: "passkey";
  enabledAt: number;
}

export type MethodConfig =
  | TotpMethodConfig
  | EmailMethodConfig
  | PasskeyMethodConfig;

export interface TwoFactorConfig {
  version: 2;
  defaultMethod: TwoFactorMethod;
  methods: MethodConfig[];
}

// Legacy v1 config shape (for migration)
interface LegacyTwoFactorConfig {
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
  type: "totp-setup" | "email-setup" | "email-verify" | "email-disable";
  expiresAt: number;
  attempts: number;
  email?: string;
}

// --- Migration ---

function migrateV1ToV2(legacy: LegacyTwoFactorConfig): TwoFactorConfig {
  const methods: MethodConfig[] = [];

  if (legacy.method === "totp" && legacy.totpSecret) {
    methods.push({
      type: "totp",
      secret: legacy.totpSecret,
      enabledAt: legacy.enabledAt,
    });
  } else if (legacy.method === "email" && legacy.email) {
    methods.push({
      type: "email",
      address: legacy.email,
      enabledAt: legacy.enabledAt,
    });
  } else if (legacy.method === "passkey") {
    methods.push({
      type: "passkey",
      enabledAt: legacy.enabledAt,
    });
  }

  return {
    version: 2,
    defaultMethod: legacy.method,
    methods,
  };
}

// --- Config Storage ---

const CONFIG_KEY = (did: string) => `twofa:${did}`;
const CREDENTIALS_KEY = (did: string) => `twofa:credentials:${did}`;
const CHALLENGE_KEY = (did: string) => `twofa:challenge:${did}`;
const PENDING_KEY = (did: string) => `twofa:pending:${did}`;

export async function getTwoFactorConfig(
  did: string,
): Promise<TwoFactorConfig | null> {
  if (!redis) return null;
  const r = requireRedis();
  const data = await r.get<string>(CONFIG_KEY(did));
  if (!data) return null;

  const parsed = typeof data === "string" ? JSON.parse(data) : data;

  // Lazy migration: v1 → v2
  if (!parsed.version) {
    const migrated = migrateV1ToV2(parsed as LegacyTwoFactorConfig);
    await r.set(CONFIG_KEY(did), JSON.stringify(migrated));
    return migrated;
  }

  return parsed as TwoFactorConfig;
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
  return config !== null && config.methods.length > 0;
}

// --- Multi-method helpers ---

export function getMethodConfig<T extends TwoFactorMethod>(
  config: TwoFactorConfig,
  type: T,
): Extract<MethodConfig, { type: T }> | undefined {
  return config.methods.find((m) => m.type === type) as
    | Extract<MethodConfig, { type: T }>
    | undefined;
}

export function getEnabledMethods(config: TwoFactorConfig): TwoFactorMethod[] {
  return config.methods.map((m) => m.type);
}

export function addMethod(
  config: TwoFactorConfig | null,
  method: MethodConfig,
): TwoFactorConfig {
  if (!config) {
    return {
      version: 2,
      defaultMethod: method.type,
      methods: [method],
    };
  }

  // Replace if same type already exists
  const filtered = config.methods.filter((m) => m.type !== method.type);
  filtered.push(method);

  return {
    version: 2,
    defaultMethod: config.defaultMethod,
    methods: filtered,
  };
}

export function removeMethod(
  config: TwoFactorConfig,
  type: TwoFactorMethod,
): TwoFactorConfig | null {
  const filtered = config.methods.filter((m) => m.type !== type);
  if (filtered.length === 0) return null;

  // If we removed the default, pick the first remaining method
  const defaultMethod =
    config.defaultMethod === type ? filtered[0].type : config.defaultMethod;

  return {
    version: 2,
    defaultMethod,
    methods: filtered,
  };
}

export async function setDefaultMethod(
  did: string,
  method: TwoFactorMethod,
): Promise<{ success: boolean; error?: string }> {
  const config = await getTwoFactorConfig(did);
  if (!config) return { success: false, error: "2FA not enabled" };

  const hasMethod = config.methods.some((m) => m.type === method);
  if (!hasMethod) return { success: false, error: "Method not enabled" };

  config.defaultMethod = method;
  await saveTwoFactorConfig(did, config);
  return { success: true };
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
    console.log(`[2fa] Email OTP for ${email}: ${code} (SMTP not configured)`);
    return;
  }

  console.log(`[2fa] Sending OTP email to ${email} via ${host}:${port}`);

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

export async function deletePasskeyCredentials(did: string): Promise<void> {
  const r = requireRedis();
  await r.del(CREDENTIALS_KEY(did));
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
