"use client";

import { useState, useEffect, useCallback } from "react";

export function SendTransaction({
  smartAccountAddress,
  csrfToken,
}: {
  smartAccountAddress: string | null;
  csrfToken: string;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<
    "idle" | "confirming" | "sending" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<{
    txHash: string;
    userOpHash: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [balance, setBalance] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!smartAccountAddress) return;
    try {
      const res = await fetch(
        `/api/wallet/balance?address=${smartAccountAddress}`,
      );
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch {
      /* ignore */
    }
  }, [smartAccountAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (!smartAccountAddress) return null;

  const handleSubmit = () => {
    const trimmedTo = to.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedTo)) {
      setErrorMsg("Please enter a valid Ethereum address (0x...)");
      setStatus("error");
      return;
    }

    const ethAmount = amount.trim() || "0";
    if (isNaN(Number(ethAmount)) || Number(ethAmount) < 0) {
      setErrorMsg("Please enter a valid amount");
      setStatus("error");
      return;
    }

    setStatus("confirming");
    setErrorMsg("");
  };

  const handleConfirm = async () => {
    const trimmedTo = to.trim();
    const ethAmount = amount.trim() || "0";

    setStatus("sending");
    setResult(null);

    try {
      const res = await fetch("/api/wallet/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ to: trimmedTo, amount: ethAmount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Transaction failed");
      }

      setResult(data);
      setStatus("success");
      fetchBalance();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
      setStatus("error");
    }
  };

  const handleCancel = () => {
    setStatus("idle");
    setErrorMsg("");
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "6px",
  };

  const monoStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "#6b6b6b",
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    wordBreak: "break-all",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: "14px",
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    border: "1px solid #d4d0cb",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
    background:
      status === "sending" || status === "confirming" ? "#f5f5f5" : "#fff",
    color: "#1A130F",
  };

  const buttonStyle: React.CSSProperties = {
    display: "inline-flex",
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

  return (
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
      <div style={labelStyle}>Send Test Transaction</div>
      <p style={{ fontSize: "13px", color: "#6b6b6b", margin: "4px 0 16px 0" }}>
        Send a gasless ETH transaction on Sepolia Testnet from your smart
        account.
      </p>

      <div
        style={{
          background: "#f8f7f5",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={labelStyle}>Balance</div>
        <div
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#1A130F",
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          }}
        >
          {balance !== null ? `${parseFloat(balance).toFixed(6)} ETH` : "..."}
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <input
          type="text"
          placeholder="0x... recipient address"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          disabled={status === "sending" || status === "confirming"}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <input
          type="text"
          placeholder="Amount in ETH (e.g. 0.001)"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          disabled={status === "sending" || status === "confirming"}
          style={inputStyle}
        />
      </div>

      {status === "confirming" ? (
        <div
          style={{
            background: "#fef9e7",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "12px",
            border: "1px solid #f0e6c0",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#1A130F",
              marginBottom: "8px",
            }}
          >
            Confirm transaction
          </div>
          <div
            style={{ fontSize: "13px", color: "#6b6b6b", marginBottom: "4px" }}
          >
            Send <strong>{amount.trim() || "0"} ETH</strong> to
          </div>
          <div style={{ ...monoStyle, marginBottom: "12px" }}>{to.trim()}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleConfirm} style={buttonStyle}>
              Confirm
            </button>
            <button
              onClick={handleCancel}
              style={{ ...buttonStyle, background: "#6b6b6b" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={status === "sending"}
          style={{
            ...buttonStyle,
            background: status === "sending" ? "#4a4a4a" : "#1A130F",
            opacity: status === "sending" ? 0.7 : 1,
            cursor: status === "sending" ? "default" : "pointer",
          }}
        >
          {status === "sending" ? "Sending..." : "Send"}
        </button>
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

      {status === "success" && result && (
        <div
          style={{
            background: "#f0fdf4",
            padding: "16px",
            borderRadius: "8px",
            marginTop: "16px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#166534",
              fontWeight: 500,
              marginBottom: "8px",
            }}
          >
            Transaction sent successfully
          </div>
          <div style={{ marginBottom: "8px" }}>
            <div style={{ ...labelStyle, color: "#166534" }}>
              Transaction Hash
            </div>
            <a
              href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...monoStyle,
                color: "#166534",
                textDecoration: "underline",
              }}
            >
              {result.txHash}
            </a>
          </div>
          <div>
            <div style={{ ...labelStyle, color: "#166534" }}>UserOp Hash</div>
            <div style={{ ...monoStyle, color: "#166534" }}>
              {result.userOpHash}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
