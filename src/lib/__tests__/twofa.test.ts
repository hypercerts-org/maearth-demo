import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  getTotpUri,
  verifyTotpCode,
  generateEmailOtp,
} from "../twofa";
import { TOTP, Secret } from "otpauth";

describe("TOTP", () => {
  it("generates a valid base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it("generates a valid otpauth URI", () => {
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, "test.user");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Ma%20Earth");
    expect(uri).toContain("secret=");
    expect(uri).toContain("test.user");
  });

  it("verifies a valid TOTP code", () => {
    const secret = generateTotpSecret();
    const totp = new TOTP({
      issuer: "Ma Earth",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);
    expect(verifyTotpCode(secret, "123456")).toBe(false);
  });

  it("rejects empty and malformed codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "")).toBe(false);
    expect(verifyTotpCode(secret, "abc")).toBe(false);
  });
});

describe("Email OTP", () => {
  it("generates a 6-digit code", () => {
    const code = generateEmailOtp();
    expect(code).toMatch(/^\d{6}$/);
    expect(code.length).toBe(6);
  });

  it("pads codes with leading zeros", () => {
    // Run multiple times to increase chance of hitting a low number
    const codes = Array.from({ length: 100 }, () => generateEmailOtp());
    for (const code of codes) {
      expect(code.length).toBe(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("generates different codes", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateEmailOtp()),
    );
    // With 20 random codes from 1M possibilities, collisions are extremely unlikely
    expect(codes.size).toBeGreaterThan(15);
  });
});
