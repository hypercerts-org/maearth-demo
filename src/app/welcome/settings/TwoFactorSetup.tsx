"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

type Method = "passkey" | "totp" | "email";
type SetupState =
  | "overview"
  | "select-method"
  | "passkey-setup"
  | "totp-setup"
  | "totp-verify"
  | "email-enter"
  | "email-verify"
  | "disable-confirm"
  | "complete";

export function TwoFactorSetup({
  currentMethod,
  currentEmail,
  userHandle,
  csrfToken,
}: {
  currentMethod: Method | null;
  currentEmail: string | null;
  userHandle: string;
  csrfToken: string;
}) {
  const [state, setState] = useState<SetupState>("overview");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [enabled, setEnabled] = useState(currentMethod !== null);

  const headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "6px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: "14px",
    border: "1px solid #d4d0cb",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
    color: "#1A130F",
  };

  const codeInputStyle: React.CSSProperties = {
    ...inputStyle,
    fontSize: "20px",
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    textAlign: "center",
    letterSpacing: "8px",
  };

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#faf9f6",
    background: "#1A130F",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "transparent",
    color: "#1A130F",
    border: "1px solid #d4d0cb",
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "#dc3545",
  };

  const methodCardStyle: React.CSSProperties = {
    padding: "16px",
    border: "1px solid #d4d0cb",
    borderRadius: "8px",
    cursor: "pointer",
    marginBottom: "8px",
    textAlign: "left",
  };

  const errorBox = errorMsg && status === "error" && (
    <div
      style={{
        background: "#fdf0f0",
        color: "#dc3545",
        padding: "12px 16px",
        borderRadius: "8px",
        fontSize: "13px",
        marginBottom: "16px",
      }}
    >
      {errorMsg}
    </div>
  );

  // --- Passkey setup ---
  const handlePasskeySetup = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const optionsRes = await fetch("/api/twofa/passkey-register-options", {
        method: "POST",
        headers,
      });
      if (!optionsRes.ok) throw new Error("Failed to get registration options");
      const options = await optionsRes.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/twofa/passkey-register-verify", {
        method: "POST",
        headers,
        body: JSON.stringify(attestation),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }

      setEnabled(true);
      setState("complete");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Passkey setup failed");
      setStatus("error");
    }
  };

  // --- TOTP setup ---
  const handleTotpInit = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/totp-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "init" }),
      });
      if (!res.ok) throw new Error("Failed to generate TOTP secret");
      const data = await res.json();
      setQrSvg(data.qrCodeSvg);
      setManualKey(data.secret);
      setState("totp-verify");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "TOTP setup failed");
      setStatus("error");
    }
  };

  const handleTotpVerify = async () => {
    if (code.length < 6) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/totp-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "verify", code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }
      setEnabled(true);
      setState("complete");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
  };

  // --- Email setup ---
  const handleEmailSend = async () => {
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/email-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "send", email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send code");
      }
      setState("email-verify");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send code");
      setStatus("error");
    }
  };

  const handleEmailVerify = async () => {
    if (code.length < 6) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/email-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "verify", code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }
      setEnabled(true);
      setState("complete");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
  };

  // --- Disable ---
  const handleDisable = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const body: Record<string, string> = {};
      if (currentMethod === "totp" || currentMethod === "email") {
        body.code = code.trim();
      }
      const res = await fetch("/api/twofa/disable", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disable 2FA");
      }
      setEnabled(false);
      setState("overview");
      setCode("");
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to disable");
      setStatus("error");
    }
  };

  // --- Overview ---
  if (state === "overview") {
    return (
      <div>
        <div style={labelStyle}>Two-Factor Authentication</div>
        {enabled ? (
          <>
            <div
              style={{
                background: "#f0fdf4",
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#166534",
                marginBottom: "16px",
                marginTop: "8px",
              }}
            >
              2FA is enabled
              {currentMethod === "passkey" && " via passkey"}
              {currentMethod === "totp" && " via authenticator app"}
              {currentMethod === "email" &&
                ` via email (${currentEmail ? currentEmail.replace(/^(.).*@/, "$1***@") : ""})`}
            </div>
            <button
              onClick={() => {
                setState("disable-confirm");
                setCode("");
                setErrorMsg("");
                setStatus("idle");
              }}
              style={dangerButtonStyle}
            >
              Disable 2FA
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: "13px",
                color: "#6b6b6b",
                margin: "4px 0 16px 0",
              }}
            >
              Add a second factor to protect your account.
            </p>
            <button
              onClick={() => {
                setState("select-method");
                setErrorMsg("");
                setStatus("idle");
              }}
              style={buttonStyle}
            >
              Enable 2FA
            </button>
          </>
        )}
      </div>
    );
  }

  // --- Method selection ---
  if (state === "select-method") {
    return (
      <div>
        <div style={labelStyle}>Choose a method</div>
        <div
          onClick={() => {
            setState("passkey-setup");
            handlePasskeySetup();
          }}
          style={methodCardStyle}
        >
          <div
            style={{ fontSize: "15px", fontWeight: 500, color: "#1A130F" }}
          >
            Passkey
          </div>
          <div style={{ fontSize: "13px", color: "#6b6b6b", marginTop: "4px" }}>
            Touch ID, Face ID, or security key
          </div>
        </div>
        <div
          onClick={() => {
            setState("totp-setup");
            handleTotpInit();
          }}
          style={methodCardStyle}
        >
          <div
            style={{ fontSize: "15px", fontWeight: 500, color: "#1A130F" }}
          >
            Authenticator app
          </div>
          <div style={{ fontSize: "13px", color: "#6b6b6b", marginTop: "4px" }}>
            Google Authenticator, Authy, or similar
          </div>
        </div>
        <div
          onClick={() => {
            setState("email-enter");
            setEmail("");
            setCode("");
            setErrorMsg("");
          }}
          style={methodCardStyle}
        >
          <div
            style={{ fontSize: "15px", fontWeight: 500, color: "#1A130F" }}
          >
            Second email
          </div>
          <div style={{ fontSize: "13px", color: "#6b6b6b", marginTop: "4px" }}>
            Receive a code at a different email address
          </div>
        </div>
        <button
          onClick={() => setState("overview")}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- Passkey setup (loading state) ---
  if (state === "passkey-setup") {
    return (
      <div>
        <div style={labelStyle}>Passkey setup</div>
        {errorBox}
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}
        >
          {status === "loading"
            ? "Follow the prompt to register your passkey..."
            : "Registration failed. Try again."}
        </p>
        {status === "error" && (
          <button onClick={handlePasskeySetup} style={buttonStyle}>
            Try again
          </button>
        )}
        <button
          onClick={() => setState("select-method")}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Back
        </button>
      </div>
    );
  }

  // --- TOTP setup / verify ---
  if (state === "totp-setup") {
    return (
      <div>
        <div style={labelStyle}>Authenticator setup</div>
        {errorBox}
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}
        >
          {status === "loading" ? "Generating..." : "Setting up authenticator app."}
        </p>
        <button
          onClick={() => setState("select-method")}
          style={secondaryButtonStyle}
        >
          Back
        </button>
      </div>
    );
  }

  if (state === "totp-verify") {
    return (
      <div>
        <div style={labelStyle}>Scan QR code</div>
        {errorBox}
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 12px 0" }}
        >
          Scan this QR code with your authenticator app.
        </p>
        {qrSvg && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "12px",
            }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
        <div
          style={{
            background: "#f8f7f5",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "11px",
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            color: "#6b6b6b",
            wordBreak: "break-all",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          {manualKey}
        </div>
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "0 0 8px 0" }}
        >
          Enter the 6-digit code from your app:
        </p>
        <div style={{ marginBottom: "12px" }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              if (status === "error") setStatus("idle");
            }}
            disabled={status === "loading"}
            style={codeInputStyle}
            autoFocus
          />
        </div>
        <button
          onClick={handleTotpVerify}
          disabled={status === "loading" || code.length < 6}
          style={{
            ...buttonStyle,
            opacity: status === "loading" || code.length < 6 ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Verifying..." : "Verify & enable"}
        </button>
        <button
          onClick={() => setState("select-method")}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- Email enter ---
  if (state === "email-enter") {
    return (
      <div>
        <div style={labelStyle}>Second email</div>
        {errorBox}
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 12px 0" }}
        >
          Enter an email address to receive verification codes.
        </p>
        <div style={{ marginBottom: "12px" }}>
          <input
            type="email"
            placeholder="your-other-email@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            disabled={status === "loading"}
            style={inputStyle}
            autoFocus
          />
        </div>
        <button
          onClick={handleEmailSend}
          disabled={status === "loading" || !email.trim()}
          style={{
            ...buttonStyle,
            opacity: status === "loading" || !email.trim() ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Sending..." : "Send verification code"}
        </button>
        <button
          onClick={() => setState("select-method")}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- Email verify ---
  if (state === "email-verify") {
    return (
      <div>
        <div style={labelStyle}>Verify email</div>
        {errorBox}
        <p
          style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 12px 0" }}
        >
          Enter the 6-digit code sent to {email}.
        </p>
        <div style={{ marginBottom: "12px" }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              if (status === "error") setStatus("idle");
            }}
            disabled={status === "loading"}
            style={codeInputStyle}
            autoFocus
          />
        </div>
        <button
          onClick={handleEmailVerify}
          disabled={status === "loading" || code.length < 6}
          style={{
            ...buttonStyle,
            opacity: status === "loading" || code.length < 6 ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Verifying..." : "Verify & enable"}
        </button>
        <button
          onClick={() => setState("select-method")}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- Disable confirm ---
  if (state === "disable-confirm") {
    return (
      <div>
        <div style={labelStyle}>Disable 2FA</div>
        {errorBox}
        {currentMethod === "passkey" ? (
          <>
            <p
              style={{
                fontSize: "13px",
                color: "#6b6b6b",
                margin: "4px 0 16px 0",
              }}
            >
              Are you sure you want to disable two-factor authentication?
            </p>
            <button
              onClick={handleDisable}
              disabled={status === "loading"}
              style={{
                ...dangerButtonStyle,
                opacity: status === "loading" ? 0.7 : 1,
              }}
            >
              {status === "loading" ? "Disabling..." : "Confirm disable"}
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: "13px",
                color: "#6b6b6b",
                margin: "4px 0 12px 0",
              }}
            >
              Enter your current 2FA code to confirm.
            </p>
            <div style={{ marginBottom: "12px" }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  if (status === "error") setStatus("idle");
                }}
                disabled={status === "loading"}
                style={codeInputStyle}
                autoFocus
              />
            </div>
            <button
              onClick={handleDisable}
              disabled={status === "loading" || code.length < 6}
              style={{
                ...dangerButtonStyle,
                opacity: status === "loading" || code.length < 6 ? 0.7 : 1,
              }}
            >
              {status === "loading" ? "Disabling..." : "Confirm disable"}
            </button>
          </>
        )}
        <button
          onClick={() => {
            setState("overview");
            setCode("");
            setErrorMsg("");
            setStatus("idle");
          }}
          style={{ ...secondaryButtonStyle, marginTop: "8px" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // --- Complete ---
  if (state === "complete") {
    return (
      <div>
        <div style={labelStyle}>Two-Factor Authentication</div>
        <div
          style={{
            background: "#f0fdf4",
            padding: "16px",
            borderRadius: "8px",
            fontSize: "14px",
            color: "#166534",
            marginTop: "8px",
            marginBottom: "16px",
          }}
        >
          2FA has been enabled successfully.
        </div>
        <button
          onClick={() => {
            setState("overview");
            window.location.reload();
          }}
          style={buttonStyle}
        >
          Done
        </button>
      </div>
    );
  }

  return null;
}
