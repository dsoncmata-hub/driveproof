export const LEGACY_OWNER_KEY = "driveproof:local-owner";
let scope = "guest";
let generation = 0;
export const localScope = () => scope;
export const scopeGeneration = () => generation;
export function changeScope(next: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(next)) throw Error("Conta local inválida.");
  scope = next;
  generation++;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("carvrum:scope-change"));
}
export const canReadLegacy = () => {
  const owner = localStorage.getItem(LEGACY_OWNER_KEY);
  return owner ? owner === scope : scope === "guest";
};
