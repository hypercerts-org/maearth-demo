import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookie } from "@/lib/session";
import { getTwoFactorConfig } from "@/lib/twofa";
import { generateCsrfToken } from "@/lib/csrf";
import { TwoFactorSetup } from "./TwoFactorSetup";

export default async function Settings() {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore);

  if (!session) {
    redirect("/");
  }

  if (session.verified === false) {
    redirect("/verify-2fa");
  }

  const config = await getTwoFactorConfig(session.userDid);
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
          maxWidth: "520px",
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
          Security Settings
        </p>

        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "28px 32px",
            textAlign: "left",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            marginBottom: "32px",
          }}
        >
          <TwoFactorSetup
            currentMethod={config?.method ?? null}
            currentEmail={config?.email ?? null}
            userHandle={session.userHandle}
            csrfToken={csrfToken}
          />
        </div>

        <a
          href="/welcome"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 28px",
            fontSize: "16px",
            fontWeight: 500,
            color: "#1A130F",
            background: "transparent",
            border: "1px solid #d4d0cb",
            borderRadius: "8px",
            cursor: "pointer",
            letterSpacing: "0.3px",
            textDecoration: "none",
          }}
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
