// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY, offlineAccount, rememberVerifiedSession } from "./offlineAccount";
const session = (id: string, claim: string) =>
  ({
    user: { id },
    access_token: "header." + btoa(JSON.stringify({ session_id: claim })) + ".signature",
  }) as Session;
beforeEach(() => localStorage.clear());
describe("previously verified offline device session", () => {
  it("does not trust a stored token without previous online verification", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session("a", "s1")));
    expect(offlineAccount()).toBeNull();
  });
  it("opens only the same previously verified session", () => {
    const s = session("a", "s1");
    rememberVerifiedSession(s);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
    expect(offlineAccount()?.id).toBe("a");
  });
  it("rejects a different owner or session", () => {
    rememberVerifiedSession(session("a", "s1"));
    for (const s of [session("b", "s1"), session("a", "s2")]) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
      expect(offlineAccount()).toBeNull();
    }
  });
  it("logout revokes the local offline grant", () => {
    const s = session("a", "s1");
    rememberVerifiedSession(s);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
    rememberVerifiedSession(null);
    expect(offlineAccount()).toBeNull();
  });
});
