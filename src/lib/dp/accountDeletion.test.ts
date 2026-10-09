import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  deletionHandler,
  type DeletionServices,
} from "../../../supabase/functions/delete-account/handler";
const api: DeletionServices = {
  verify: vi.fn(),
  request: vi.fn(),
  objects: vi.fn(),
  remove: vi.fn(),
  purge: vi.fn(),
  revoke: vi.fn(),
  deleteUser: vi.fn(),
};
const handler = deletionHandler(api);
const req = (body: unknown = { confirmation: "EXCLUIR" }, token = "valid") =>
  new Request("https://example.invalid", {
    method: "POST",
    headers: {
      Origin: "https://driveproof-taupe.vercel.app",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.mocked(api.verify).mockResolvedValue({ id: "accountA" });
  vi.mocked(api.request).mockResolvedValue(undefined);
  vi.mocked(api.objects).mockResolvedValue([]);
  for (const fn of [api.remove, api.purge, api.revoke, api.deleteUser])
    vi.mocked(fn).mockResolvedValue(undefined);
});
describe("self-service deletion authorization", () => {
  it("rejects an invalid bearer before creating a request", async () => {
    vi.mocked(api.verify).mockResolvedValue(null);
    expect((await handler(req())).status).toBe(401);
    expect(api.request).not.toHaveBeenCalled();
    expect(api.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects a caller-supplied target account", async () => {
    expect((await handler(req({ confirmation: "EXCLUIR", userId: "accountB" }))).status).toBe(400);
    expect(api.deleteUser).not.toHaveBeenCalled();
  });
  it("requires a recent confirmed login before removing objects", async () => {
    vi.mocked(api.request).mockRejectedValueOnce(Error("Entre novamente"));
    expect((await handler(req())).status).toBe(409);
    expect(api.remove).not.toHaveBeenCalled();
  });
  it("removes owned objects, purges operational copies, revokes sessions, then deletes Auth", async () => {
    vi.mocked(api.objects)
      .mockResolvedValueOnce([{ bucket: "driveproof-evidence", name: "accountA/photo/hash" }])
      .mockResolvedValue([]);
    expect((await handler(req())).status).toBe(200);
    expect(api.remove).toHaveBeenCalledWith("driveproof-evidence", ["accountA/photo/hash"]);
    expect(api.deleteUser).toHaveBeenCalledWith("accountA");
    expect(vi.mocked(api.remove).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.purge).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(api.revoke).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.deleteUser).mock.invocationCallOrder[0]!,
    );
  });
  it("stops if Storage fails, preserving the account for a retry", async () => {
    vi.mocked(api.objects).mockResolvedValue([
      { bucket: "carvrum-tracks", name: "accountA/trip/hash.json" },
    ]);
    vi.mocked(api.remove).mockRejectedValueOnce(Error("Storage unavailable"));
    expect((await handler(req())).status).toBe(409);
    expect(api.purge).not.toHaveBeenCalled();
    expect(api.deleteUser).not.toHaveBeenCalled();
  });
  it("never removes an object under another account's prefix", async () => {
    vi.mocked(api.objects).mockResolvedValue([
      { bucket: "driveproof-evidence", name: "accountB/photo" },
    ]);
    expect((await handler(req())).status).toBe(409);
    expect(api.remove).not.toHaveBeenCalled();
  });
  it("denies foreign browser origins", async () => {
    const request = req();
    request.headers.set("Origin", "https://attacker.invalid");
    expect((await handler(request)).status).toBe(403);
  });
});
