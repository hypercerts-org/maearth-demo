import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { checkRateLimit, getDailyTotal, addDailyTotal } from "@/lib/ratelimit";
import { validateCsrfToken } from "@/lib/csrf";
import { logTransaction } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT_TX = Number(process.env.RATE_LIMIT_TRANSACTION) || 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_TX_AMOUNT = Number(process.env.MAX_TRANSACTION_AMOUNT) || 0.1;
const MAX_DAILY_AMOUNT = Number(process.env.MAX_DAILY_AMOUNT) || 1.0;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // CSRF validation
  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !validateCsrfToken(csrfToken)) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // Rate limit per user
  const rl = await checkRateLimit(
    `tx:${session.userDid}`,
    RATE_LIMIT_TX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many transactions" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter) },
      },
    );
  }

  const walletUrl = process.env.WALLET_SERVICE_URL;
  const apiKey = process.env.WALLET_API_KEY;

  if (!walletUrl || !apiKey) {
    return NextResponse.json(
      { error: "Wallet service not configured" },
      { status: 503 },
    );
  }

  let body: { to?: string; amount?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to = (body.to || "").trim();
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address" },
      { status: 400 },
    );
  }

  const amount = (body.amount || "0").trim();
  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  // Per-transaction limit
  if (amountNum > MAX_TX_AMOUNT) {
    return NextResponse.json(
      { error: `Exceeds transaction limit of ${MAX_TX_AMOUNT} ETH` },
      { status: 400 },
    );
  }

  // Daily limit
  const dailyTotal = await getDailyTotal(session.userDid);
  if (dailyTotal + amountNum > MAX_DAILY_AMOUNT) {
    return NextResponse.json(
      { error: `Exceeds daily limit of ${MAX_DAILY_AMOUNT} ETH` },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const res = await fetch(`${walletUrl}/wallet/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ did: session.userDid, to, amount }),
  });

  const data = await res.json();

  if (!res.ok) {
    await logTransaction({
      did: session.userDid,
      to,
      amount: amountNum,
      status: "failed",
      error: data.error || `HTTP ${res.status}`,
      ip,
    });
    return NextResponse.json(data, { status: res.status });
  }

  // Track daily spending after successful transaction
  await addDailyTotal(session.userDid, amountNum);

  await logTransaction({
    did: session.userDid,
    to,
    amount: amountNum,
    status: "success",
    txHash: data.txHash,
    userOpHash: data.userOpHash,
    ip,
  });

  return NextResponse.json(data);
}
