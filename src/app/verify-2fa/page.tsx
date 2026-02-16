import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/session";
import { getTwoFactorConfig } from "@/lib/twofa";
import { generateCsrfToken } from "@/lib/csrf";
import { TwoFactorVerify } from "./TwoFactorVerify";

export default async function VerifyTwoFactor() {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore);

  if (!session) {
    redirect("/");
  }

  // Already verified — go to welcome
  if (session.verified !== false) {
    redirect("/welcome");
  }

  const config = await getTwoFactorConfig(session.userDid);
  if (!config) {
    // No 2FA config found — shouldn't happen, redirect to welcome
    redirect("/welcome");
  }

  const csrfToken = generateCsrfToken();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        background: "#F2EBE4",
      }}
    >
      <div
        style={{
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <img
          src="/logo.png"
          alt="Ma Earth"
          style={{ height: "80px", marginBottom: "8px" }}
        />
        <p
          style={{
            fontSize: "17px",
            color: "#6b6b6b",
            lineHeight: 1.6,
            margin: "0 0 32px 0",
          }}
        >
          Two-factor authentication required
        </p>

        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "28px 32px",
            textAlign: "left",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <TwoFactorVerify
            method={config.method}
            csrfToken={csrfToken}
          />
        </div>
      </div>
    </div>
  );
}
