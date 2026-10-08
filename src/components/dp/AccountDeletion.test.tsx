// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  invoke: vi.fn(),
  blobs: vi.fn(),
  signout: vi.fn(),
}));
vi.mock("./AccountProvider", () => ({
  useAccount: () => ({ user: { id: "ownerA", email: "fixture@example.invalid" } }),
}));
vi.mock("@/lib/dp/supabase", () => ({
  supabase: {
    auth: { getSession: mocks.session, signOut: mocks.signout },
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock("@/lib/dp/cloudSync", () => ({ checkCloudIdentity: vi.fn() }));
vi.mock("@/lib/dp/accountScope", () => ({
  localScope: () => "ownerA",
  LEGACY_OWNER_KEY: "legacy-owner",
}));
vi.mock("@/lib/dp/store", () => ({
  flushLocalWrites: async () => {},
  readDb: () => ({ activeTripId: null, evidences: [] }),
}));
vi.mock("@/lib/dp/blobs", () => ({ deleteAccountBlobs: mocks.blobs }));
vi.mock("@/lib/dp/localRecords", () => ({ deleteLocalScope: async () => {} }));
vi.mock("@/lib/dp/exporters", () => ({ deleteNativeExports: async () => {} }));
vi.mock("@/lib/dp/nativeAuth", () => ({ authRedirect: () => "https://example.invalid" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { AccountDeletion } from "./AccountDeletion";
beforeEach(() => {
  localStorage.clear();
  mocks.invoke.mockResolvedValue({ data: { status: "deleted" }, error: null });
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: "ownerA" }, access_token: "verified-token-A" } },
  });
  mocks.blobs.mockResolvedValue(undefined);
  mocks.signout.mockResolvedValue({ error: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function requestDeletion() {
  render(<AccountDeletion />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "EXCLUIR" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Excluir definitivamente minha conta" }));
  });
}
it("pins the deletion request to the verified account token", async () => {
  await requestDeletion();
  expect(mocks.invoke).toHaveBeenCalledWith("delete-account", {
    body: { confirmation: "EXCLUIR" },
    headers: { Authorization: "Bearer verified-token-A" },
  });
});
it("does not invoke deletion if another account replaces the session", async () => {
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: "ownerB" }, access_token: "token-B" } },
  });
  await requestDeletion();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("A conta mudou");
});
it("reports cloud deletion and cleanup failure truthfully and closes the local session", async () => {
  mocks.blobs.mockRejectedValue(Error("Local storage failed"));
  await requestDeletion();
  expect(mocks.signout).toHaveBeenCalledWith({ scope: "local" });
  expect(screen.getByRole("status").textContent).toContain("Conta excluída na nuvem");
  expect(screen.getByRole("status").textContent).toContain("Local storage failed");
});
