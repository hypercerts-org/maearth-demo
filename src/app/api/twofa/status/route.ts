import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie } from "@/lib/session";
import { getTwoFactorConfig } from "@/lib/twofa";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const config = await getTwoFactorConfig(session.userDid);

  if (!config) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({
    enabled: true,
    method: config.method,
    email: config.email
      ? config.email.replace(/^(.).*@/, "$1***@")
      : undefined,
  });
}
