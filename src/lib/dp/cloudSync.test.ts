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
import { emptyDb, readDb, writeDb } from "./store";
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
beforeEach(() => {
  localStorage.clear();
  writeDb(emptyDb());
  mocks.getUser.mockResolvedValue({ data: { user: { id: "accountA" } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
});
describe("secure synchronization", () => {
  it("blocks a second account from uploading the first account's records", () => {
    assertLocalOwner("accountA");
    expect(() => assertLocalOwner("accountB")).toThrow(/Conta diferente/);
  });
  it("recognizes the owner of legacy acknowledged revisions", () => {
    localStorage.setItem("driveproof:auto-sync:revision:accountA", "3");
    expect(() => assertLocalOwner("accountB")).toThrow(/outra conta/);
  });
  it("does not initialize cloud with an empty device", async () => {
    await syncRecords("accountA");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uploads through CAS and acknowledges the exact version", async () => {
    writeDb(db());
    await syncRecords("accountA");
    expect(mocks.rpc).toHaveBeenCalledWith("cloud_sync_upload", {
      expected_revision: 0,
      new_snapshot: db(),
    });
    expect(localStorage.getItem("driveproof:auto-sync:revision:accountA")).toBe("1");
  });
  it("preserves local records on a concurrent remote write", async () => {
    writeDb(db());
    mocks.maybeSingle.mockResolvedValue({ data: { revision: 2, snapshot: db("B") }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(syncRecords("accountA")).rejects.toThrow(/Outro aparelho/);
    expect(readDb()).toEqual(db());
    expect(localStorage.getItem("driveproof:auto-sync:revision:accountA")).toBeNull();
  });
  it("keeps edits made while an upload is in flight", async () => {
    writeDb(db());
    mocks.rpc.mockImplementationOnce(async () => {
      writeDb(db("A", "new edit"));
      return { data: 1, error: null };
    });
    await syncRecords("accountA");
    expect(readDb().fuelings[0]?.note).toBe("new edit");
  });
  it("receives a remote edit without uploading an unchanged copy", async () => {
    writeDb(db());
    acknowledge("accountA", 1, db());
    mocks.maybeSingle.mockResolvedValue({
      data: { revision: 2, snapshot: db("A", "cloud edit") },
      error: null,
    });
    await syncRecords("accountA");
    expect(readDb().fuelings[0]?.note).toBe("cloud edit");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects stale manual conflict choices", async () => {
    writeDb(db());
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
    writeDb(db());
    mocks.rpc.mockImplementationOnce(async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "accountB" } }, error: null });
      return { data: 1, error: null };
    });
    await expect(syncRecords("accountA")).rejects.toThrow(/Sessão/);
    expect(readDb()).toEqual(db());
  });
  it("does not falsely commit local changes when durable storage fails", () => {
    writeDb(db());
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("QuotaExceededError");
    });
    expect(() => writeDb(db("B"))).toThrow();
    expect(readDb()).toEqual(db());
    spy.mockRestore();
  });
});
