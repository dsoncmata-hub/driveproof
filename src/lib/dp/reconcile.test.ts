import { describe, expect, it } from "vitest";
import { emptyDb } from "./store";
import { planMerge } from "./reconcile";
import { parseSnapshot } from "./snapshot";
import type { Fueling } from "./types";
export const fueling = (id: string, note = ""): Fueling => ({
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
describe("cross-device three-way reconciliation", () => {
  it("unites independent additions without deleting legacy records", () => {
    const l = { ...emptyDb(), fuelings: [fueling("A")] },
      r = { ...emptyDb(), fuelings: [fueling("B")] };
    const result = planMerge(l, r);
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.fuelings.map((x) => x.id)).toEqual(["A", "B"]);
  });
  it("receives a cloud-only edit", () => {
    const base = { ...emptyDb(), fuelings: [fueling("A")] };
    const remote = { ...base, fuelings: [fueling("A", "edit cloud")] };
    expect(planMerge(base, remote, base).snapshot.fuelings[0]?.note).toBe("edit cloud");
  });
  it("preserves deletions when a base exists", () => {
    const base = { ...emptyDb(), fuelings: [fueling("A")] };
    expect(planMerge(emptyDb(), base, base).snapshot.fuelings).toEqual([]);
    expect(planMerge(base, emptyDb(), base).snapshot.fuelings).toEqual([]);
  });
  it("flags edit versus deletion and requires explicit choice", () => {
    const base = { ...emptyDb(), fuelings: [fueling("A")] };
    const local = { ...base, fuelings: [fueling("A", "changed")] };
    expect(planMerge(local, emptyDb(), base).conflicts).toHaveLength(1);
    expect(planMerge(local, emptyDb(), base, { "fuelings:A": "cloud" }).snapshot.fuelings).toEqual(
      [],
    );
    expect(
      planMerge(local, emptyDb(), base, { "fuelings:A": "local" }).snapshot.fuelings[0]?.note,
    ).toBe("changed");
  });
  it("ignores object key order", () => {
    const l = { ...emptyDb(), fuelings: [fueling("A")] };
    const f = fueling("A");
    const { note, ...rest } = f;
    const r = { ...l, fuelings: [{ note, ...rest }] };
    expect(planMerge(l, r).conflicts).toEqual([]);
  });
  it("blocks active trips and duplicated IDs", () => {
    expect(() => parseSnapshot({ ...emptyDb(), fuelings: [fueling("A"), fueling("A")] })).toThrow(
      /duplicados/,
    );
    expect(() => planMerge({ ...emptyDb(), activeTripId: "missing" }, emptyDb())).toThrow();
  });
  it("validates nested records and orphaned evidence", () => {
    expect(() => parseSnapshot({ ...emptyDb(), fuelings: [{ id: "A" }] })).toThrow();
    expect(() =>
      parseSnapshot({ ...emptyDb(), fuelings: [{ ...fueling("A"), tripId: "missing" }] }),
    ).toThrow();
  });
  it("leaves all inputs unchanged during conflict review", () => {
    const l = { ...emptyDb(), fuelings: [fueling("A", "local")] };
    const r = { ...emptyDb(), fuelings: [fueling("A", "cloud")] };
    const before = JSON.stringify({ l, r });
    expect(planMerge(l, r).conflicts).toHaveLength(1);
    expect(JSON.stringify({ l, r })).toBe(before);
  });
});
