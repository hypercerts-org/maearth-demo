"use client";

import { useState, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

export function TwoFactorVerify({
  method,
  csrfToken,
}: {
  method: "totp" | "email" | "passkey";
  csrfToken: string;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "verifying" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // Auto-trigger passkey on mount
  useEffect(() => {
    if (method === "passkey") {
      handlePasskey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasskey = async () => {
    setStatus("verifying");
    setErrorMsg("");
    try {
      // Get authentication options
      const optionsRes = await fetch("/api/twofa/passkey-auth-options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!optionsRes.ok) {
        throw new Error("Failed to get passkey options");
      }
      const options = await optionsRes.json();

      // Trigger passkey prompt
      const assertion = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch("/api/twofa/passkey-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(assertion),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Passkey verification failed");
      }

      // Success — redirect to welcome
      window.location.href = "/welcome";
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Passkey verification failed",
      );
      setStatus("error");
    }
  };

  const handleSendEmailCode = async () => {
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/send-email-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send code");
      }
      setEmailSent(true);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to send code",
      );
      setStatus("error");
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setStatus("verifying");
    setErrorMsg("");
    try {
      const res = await fetch("/api/twofa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }

      // Success — redirect to welcome
      window.location.href = "/welcome";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
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
    padding: "14px 16px",
    fontSize: "20px",
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    border: "1px solid #d4d0cb",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
    textAlign: "center",
    letterSpacing: "8px",
    color: "#1A130F",
  };

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 28px",
    fontSize: "16px",
    fontWeight: 500,
    color: "#faf9f6",
    background: "#1A130F",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  };

  // Passkey UI
  if (method === "passkey") {
    return (
      <div>
        <div style={labelStyle}>Passkey verification</div>
        <p style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}>
          {status === "verifying"
            ? "Waiting for passkey..."
            : "Use your passkey to verify your identity."}
        </p>
        {status === "error" && (
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
        )}
        <button
          onClick={handlePasskey}
          disabled={status === "verifying"}
          style={{
            ...buttonStyle,
            opacity: status === "verifying" ? 0.7 : 1,
            cursor: status === "verifying" ? "default" : "pointer",
          }}
        >
          {status === "verifying" ? "Verifying..." : "Try again"}
        </button>
      </div>
    );
  }

  // Email OTP UI
  if (method === "email") {
    return (
      <div>
        <div style={labelStyle}>Email verification</div>
        <p style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}>
          {emailSent
            ? "A code has been sent to your registered email."
            : "Click below to receive a verification code."}
        </p>
        {!emailSent ? (
          <button
            onClick={handleSendEmailCode}
            disabled={status === "sending"}
            style={{
              ...buttonStyle,
              opacity: status === "sending" ? 0.7 : 1,
              cursor: status === "sending" ? "default" : "pointer",
            }}
          >
            {status === "sending" ? "Sending..." : "Send code"}
          </button>
        ) : (
          <>
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
                disabled={status === "verifying"}
                style={inputStyle}
                autoFocus
              />
            </div>
            <button
              onClick={handleVerifyCode}
              disabled={status === "verifying" || code.length < 6}
              style={{
                ...buttonStyle,
                opacity:
                  status === "verifying" || code.length < 6 ? 0.7 : 1,
                cursor:
                  status === "verifying" || code.length < 6
                    ? "default"
                    : "pointer",
              }}
            >
              {status === "verifying" ? "Verifying..." : "Verify"}
            </button>
            <button
              onClick={handleSendEmailCode}
              disabled={status === "sending"}
              style={{
                background: "none",
                border: "none",
                color: "#6b6b6b",
                fontSize: "13px",
                cursor: "pointer",
                marginTop: "12px",
                textDecoration: "underline",
              }}
            >
              Resend code
            </button>
          </>
        )}
        {status === "error" && (
          <div
            style={{
              background: "#fdf0f0",
              color: "#dc3545",
              padding: "12px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              marginTop: "16px",
            }}
          >
            {errorMsg}
          </div>
        )}
      </div>
    );
  }

  // TOTP UI
  return (
    <div>
      <div style={labelStyle}>Authenticator code</div>
      <p style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}>
        Enter the 6-digit code from your authenticator app.
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
          disabled={status === "verifying"}
          style={inputStyle}
          autoFocus
        />
      </div>
      <button
        onClick={handleVerifyCode}
        disabled={status === "verifying" || code.length < 6}
        style={{
          ...buttonStyle,
          opacity: status === "verifying" || code.length < 6 ? 0.7 : 1,
          cursor:
            status === "verifying" || code.length < 6
              ? "default"
              : "pointer",
        }}
      >
        {status === "verifying" ? "Verifying..." : "Verify"}
      </button>
      {status === "error" && (
        <div
          style={{
            background: "#fdf0f0",
            color: "#dc3545",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            marginTop: "16px",
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
