import { describe, expect, it } from "vitest";
import { buildCycles, groupStats, stationRanking } from "./cycles";
import type { Fueling } from "./types";

let n = 0;
function f(p: Partial<Fueling>): Fueling {
  n += 1;
  return {
    id: `f${n}`,
    at: n * 1000,
    odometer: null,
    liters: null,
    pricePerLiter: 6,
    totalValue: null,
    station: "",
    stationId: "A",
    fullTank: true,
    fuelType: "gasolina",
    tripId: null,
    note: "",
    syncState: "local",
    ...p,
  };
}

describe("ciclos tanque-cheio", () => {
  it("calcula km/L entre dois cheios e deixa o último em formação", () => {
    const c = buildCycles([f({ odometer: 1000, liters: 40 }), f({ odometer: 1500, liters: 50 })]);
    expect(c).toHaveLength(2);
    expect(c[0]!.status).toBe("em_formacao");
    expect(c[1]!.status).toBe("valido");
    expect(c[1]!.kmPerL).toBeCloseTo(10);
    expect(c[1]!.costPerKm).toBeCloseTo(0.6);
  });

  it("soma litros de parciais intermediários", () => {
    const c = buildCycles([
      f({ odometer: 1000, liters: 40 }),
      f({ odometer: 1200, liters: 10, fullTank: false }),
      f({ odometer: 1600, liters: 40 }),
    ]);
    expect(c[1]!.liters).toBe(50);
    expect(c[1]!.kmPerL).toBeCloseTo(12);
  });

  it("invalida odômetro regressivo", () => {
    const c = buildCycles([f({ odometer: 1000, liters: 40 }), f({ odometer: 900, liters: 30 })]);
    expect(c[1]!.status).toBe("invalido");
    expect(c[1]!.kmPerL).toBeNull();
  });

  it("invalida mudança de combustível dentro do ciclo", () => {
    const c = buildCycles([
      f({ odometer: 1000, liters: 40 }),
      f({ odometer: 1200, liters: 15, fullTank: false, fuelType: "etanol" }),
      f({ odometer: 1500, liters: 30 }),
    ]);
    expect(c[1]!.status).toBe("invalido");
    expect(c[1]!.reasons.join(" ")).toMatch(/Combustíveis diferentes/);
  });

  it("invalida dados faltantes", () => {
    const c = buildCycles([f({ odometer: 1000, liters: 40 }), f({ odometer: 1400, liters: null })]);
    expect(c[1]!.status).toBe("invalido");
  });

  it("só existe ciclo em formação com um único cheio", () => {
    const c = buildCycles([f({ odometer: 1000, liters: 40 }), f({ odometer: 1100, liters: 5, fullTank: false })]);
    expect(c).toHaveLength(1);
    expect(c[0]!.status).toBe("em_formacao");
  });
});

describe("atribuição ao posto", () => {
  it("não atribui ao posto que fecha o ciclo", () => {
    // A, A, B: ciclo A→B consome combustível de A (residual A) → atribui A, nunca B
    const c = buildCycles([
      f({ odometer: 1000, liters: 40, stationId: "A" }),
      f({ odometer: 1400, liters: 40, stationId: "A" }),
      f({ odometer: 1800, liters: 40, stationId: "B" }),
    ]);
    expect(c[1]!.endId).toBe(c[0]!.startId);
    expect(c[1]!.attribution).toEqual({ kind: "posto_unico", stationId: "A" });
    expect(c.some((x) => x.attribution.kind === "posto_unico" && x.attribution.stationId === "B")).toBe(false);
  });

  it("primeiro ciclo sem residual conhecido fica sem atribuição", () => {
    const c = buildCycles([f({ odometer: 1000, liters: 40 }), f({ odometer: 1400, liters: 40 })]);
    expect(c[1]!.attribution.kind).toBe("sem_posto");
  });

  it("ciclo com parcial de outro posto é misto", () => {
    const c = buildCycles([
      f({ odometer: 900, liters: 40, stationId: "A" }),
      f({ odometer: 1000, liters: 10, stationId: "A" }),
      f({ odometer: 1200, liters: 10, stationId: "B", fullTank: false }),
      f({ odometer: 1500, liters: 30, stationId: "A" }),
    ]);
    expect(c[1]!.attribution.kind).toBe("misto");
  });

  it("ranking exige 2+ ciclos para sair de amostra insuficiente", () => {
    const list = [0, 1, 2, 3].map((i) => f({ odometer: 1000 + i * 400, liters: 40, stationId: "A" }));
    const r = stationRanking(buildCycles(list));
    expect(r).toHaveLength(1);
    expect(r[0]!.stats.n).toBe(2);
    expect(r[0]!.stats.confidence).toBe("baixa");
    expect(groupStats([]).confidence).toBe("insuficiente");
  });
});