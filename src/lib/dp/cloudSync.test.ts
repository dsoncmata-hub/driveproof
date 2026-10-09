// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  },
}));
import { acknowledge, assertLocalOwner, syncRecords } from "./cloudSync";
import { activateLocalAccount, emptyDb, readDb, writeDb } from "./store";
import { canonical } from "./snapshot";
import type { Fueling } from "./types";
const f = (id: string, note = ""): Fueling => ({
  id,
  at: 1,
  odometer: 100,
  liters: 10,
  pricePerLiter: 5,
  totalValue: 50,
  station: "Posto",
  fullTank: true,
  fuelType: "gasolina",
  tripId: null,
  note,
  syncState: "local",
});
const db = (id = "A", note = "") => ({ ...emptyDb(), fuelings: [f(id, note)] });
beforeEach(async () => {
  localStorage.clear();
  await activateLocalAccount("accountA");
  await writeDb(emptyDb());
  mocks.getUser.mockResolvedValue({ data: { user: { id: "accountA" } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
});
describe("secure synchronization", async () => {
  it("blocks a second account from uploading the first account's records", async () => {
    assertLocalOwner("accountA");
    expect(() => assertLocalOwner("accountB")).toThrow(/Conta diferente/);
  });
  it("opens a separate empty vault for another verified account", async () => {
    await writeDb(db());
    await activateLocalAccount("accountB");
    expect(readDb().fuelings).toHaveLength(0);
    expect(() => assertLocalOwner("accountA")).toThrow(/Conta diferente/);
    await activateLocalAccount("accountA");
    expect(readDb().fuelings[0]!.id).toBe("A");
  });
  it("does not initialize cloud with an empty device", async () => {
    await syncRecords("accountA");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uploads through CAS and acknowledges the exact version", async () => {
    await writeDb(db());
    await syncRecords("accountA");
    expect(mocks.rpc).toHaveBeenCalledWith("cloud_sync_upload_v2", {
      expected_revision: 0,
      new_snapshot: { ...db(), syncProtocol: 2 },
    });
    expect(localStorage.getItem("driveproof:auto-sync:revision:accountA")).toBe("1");
  });
  it("preserves local records on a concurrent remote write", async () => {
    await writeDb(db());
    mocks.maybeSingle.mockResolvedValue({ data: { revision: 2, snapshot: db("B") }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(syncRecords("accountA")).rejects.toThrow(/Outro aparelho/);
    expect(readDb()).toEqual(db());
    expect(localStorage.getItem("driveproof:auto-sync:revision:accountA")).toBeNull();
  });
  it("keeps edits made while an upload is in flight", async () => {
    await writeDb(db());
    mocks.rpc.mockImplementationOnce(async () => {
      await writeDb(db("A", "new edit"));
      return { data: 1, error: null };
    });
    await syncRecords("accountA");
    expect(readDb().fuelings[0]?.note).toBe("new edit");
  });
  it("receives a remote edit without uploading an unchanged copy", async () => {
    await writeDb(db());
    await acknowledge("accountA", 1, db());
    mocks.maybeSingle.mockResolvedValue({
      data: { revision: 2, snapshot: { ...db("A", "cloud edit"), syncProtocol: 2 } },
      error: null,
    });
    await syncRecords("accountA");
    expect(readDb().fuelings[0]?.note).toBe("cloud edit");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects stale manual conflict choices", async () => {
    await writeDb(db());
    mocks.maybeSingle.mockResolvedValue({
      data: { revision: 3, snapshot: db("A", "remote") },
      error: null,
    });
    await expect(
      syncRecords("accountA", { "fuelings:A": "local" }, { local: canonical(db()), revision: 2 }),
    ).rejects.toThrow(/mudaram/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks commit if the authenticated account changes during upload", async () => {
    await writeDb(db());
    mocks.rpc.mockImplementationOnce(async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "accountB" } }, error: null });
      return { data: 1, error: null };
    });
    await expect(syncRecords("accountA")).rejects.toThrow(/Sessão/);
    expect(readDb()).toEqual(db());
  });
  it("does not falsely commit when the IndexedDB transaction fails", async () => {
    await writeDb(db());
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    await expect(writeDb(db("B"))).rejects.toThrow();
    expect(readDb()).toEqual(db());
    spy.mockRestore();
  });
});
