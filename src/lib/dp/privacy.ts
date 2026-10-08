import { localScope } from "./accountScope";
export const PRIVACY_VERSION = "2026-10-08.1";
const key = () => "carvrum:privacy:" + localScope();
export function locationAllowed() {
  if (typeof localStorage === "undefined") return false;
  try {
    const value = JSON.parse(localStorage.getItem(key()) ?? "null");
    return value?.version === PRIVACY_VERSION && value.location === true;
  } catch {
    return false;
  }
}
export function setLocationConsent(allowed: boolean) {
  localStorage.setItem(
    key(),
    JSON.stringify({ version: PRIVACY_VERSION, location: allowed, at: Date.now() }),
  );
  window.dispatchEvent(new Event("carvrum:privacy-change"));
}
