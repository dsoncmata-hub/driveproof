// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { validNativeCallback } from "./nativeAuth";
const pending = { nonce: "test-nonce", at: 1000 };
describe("native PKCE callback binding", () => {
  it("accepts only the matching recent callback with authorization code", () => {
    expect(
      validNativeCallback(
        "carvrum://auth-callback?nonce=test-nonce&code=one-time-code",
        pending,
        2000,
      ),
    ).toBe(true);
  });
  it.each([
    "https://auth-callback?nonce=test-nonce&code=x",
    "carvrum://another-host?nonce=test-nonce&code=x",
    "carvrum://auth-callback/other?nonce=test-nonce&code=x",
    "carvrum://auth-callback?nonce=other&code=x",
    "carvrum://auth-callback?nonce=test-nonce",
  ])("rejects mismatched callbacks: %s", (url) => {
    expect(validNativeCallback(url, pending, 2000)).toBe(false);
  });
  it("rejects expired and future pending requests", () => {
    const url = "carvrum://auth-callback?nonce=test-nonce&code=x";
    expect(validNativeCallback(url, pending, 601000)).toBe(false);
    expect(validNativeCallback(url, pending, 999)).toBe(false);
  });
});
