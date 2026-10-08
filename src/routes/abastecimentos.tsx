import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dp/AppShell";
import { EvidenceCapture } from "@/components/dp/EvidenceCapture";
import { EvidenceList } from "@/components/dp/EvidenceList";
import { Notice, Panel, Row, Stat } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/dp/defaults";
import { tankToTankConsumption } from "@/lib/dp/analysis";
import { exportFuelingsCsv } from "@/lib/dp/exporters";
import { fmtDateTime, fmtMoney, fmtNum } from "@/lib/dp/format";
import { addFueling, deleteFueling, uid, useDb } from "@/lib/dp/store";
import type { FuelType } from "@/lib/dp/types";

export const Route = createFileRoute("/abastecimentos")({
  head: () => ({
    meta: [
      { title: "Abastecimentos — DriveProof" },
      {
        name: "description",
        content:
          "Registre litros, preço, hodômetro e fotos da bomba. Consumo bomba-a-bomba somente entre tanques cheios.",
      },
      { property: "og:title", content: "Abastecimentos — DriveProof" },
      {
        property: "og:description",
        content: "Controle de abastecimentos com cálculo de km/L entre tanques cheios.",
      },
    ],
  }),
  component: Abastecimentos,
});

const FUEL_OPTIONS: FuelType[] = ["gasolina", "etanol", "mistura", "diesel", "gnv"];

function Abastecimentos() {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [station, setStation] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [fuelType, setFuelType] = useState<FuelType>("gasolina");
  const [note, setNote] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  const segments = tankToTankConsumption(db.fuelings);
  const avg =
    segments.length > 0 ? segments.reduce((a, s) => a + s.kmPerL, 0) / segments.length : null;

  function save() {
    const l = liters === "" ? null : Number(liters);
    const p = price === "" ? null : Number(price);
    const t = total === "" ? (l != null && p != null ? Number((l * p).toFixed(2)) : null) : Number(total);
    const odo = odometer === "" ? null : Number(odometer);
    if (odo == null || !Number.isFinite(odo) || odo < 0) {
      toast.error("Informe um hodômetro válido para registrar o abastecimento.");
      return;
    }
    if (l == null || !Number.isFinite(l) || l <= 0) {
      toast.error("Informe a quantidade de litros maior que zero.");
      return;
    }
    if ((p != null && (!Number.isFinite(p) || p <= 0)) ||
        (t != null && (!Number.isFinite(t) || t <= 0))) {
      toast.error("Preço e valor total, quando informados, devem ser positivos.");
      return;
    }
    const id = uid("fuel");
    addFueling({
      id,
      at: Date.now(),
      odometer: odo,
      liters: l,
      pricePerLiter: p,
      totalValue: t,
      station,
      fullTank,
      fuelType,
      tripId: db.activeTripId,
      note,
      syncState: "local",
    });
    setLastId(id);
    setOdometer("");
    setLiters("");
    setPrice("");
    setTotal("");
    setStation("");
    setNote("");
    setOpen(false);
    toast.success("Abastecimento registrado", {
      description: fullTank ? "Marcado como tanque cheio." : "Parcial: fora do cálculo bomba-a-bomba.",
    });
  }

  return (
    <AppShell
      title="Abastecimentos"
      subtitle={`${db.fuelings.length} registro(s)`}
      action={
        <Button className="min-h-12" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-5" /> Novo
        </Button>
      }
    >
      <div className="space-y-4">
        {open ? (
          <Panel title="Novo abastecimento">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hodômetro (km)" value={odometer} onChange={setOdometer} />
              <Field label="Litros" value={liters} onChange={setLiters} step="0.01" />
              <Field label="Preço por litro (R$)" value={price} onChange={setPrice} step="0.001" />
              <Field label="Valor total (R$)" value={total} onChange={setTotal} step="0.01" />
              <label className="col-span-2 block">
                <span className="label-tec">Posto (opcional)</span>
                <input
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className="mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
                />
              </label>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <span className="label-tec">Combustível</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {FUEL_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFuelType(f)}
                      className={`min-h-11 rounded-md border px-3 text-sm font-medium ${
                        fuelType === f
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      {LABELS.fuelType[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
                <span className="min-w-0 text-sm">Tanque cheio</span>
                <div className="flex shrink-0 gap-1">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setFullTank(v)}
                      className={`min-h-10 rounded px-3 text-sm font-semibold ${
                        fullTank === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                      }`}
                    >
                      {v ? "Sim" : "Não"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="label-tec">Observação</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
                />
              </label>
            </div>
            <Button className="mt-4 min-h-14 w-full" onClick={save}>
              Salvar abastecimento
            </Button>
          </Panel>
        ) : null}

        {lastId ? (
          <Panel title="Fotos do último abastecimento">
            <EvidenceCapture fuelingId={lastId} defaultCategory="bomba" />
            <div className="mt-4">
              <EvidenceList items={db.evidences.filter((e) => e.fuelingId === lastId)} />
            </div>
          </Panel>
        ) : null}

        <Panel
          title="Consumo bomba-a-bomba"
          right={
            <Button size="sm" variant="ghost" onClick={() => exportFuelingsCsv(db)}>
              <FileDown className="size-4" /> CSV
            </Button>
          }
        >
          {segments.length === 0 ? (
            <Notice>
              São necessários pelo menos dois abastecimentos marcados como tanque cheio, com
              hodômetro e litros, para calcular km/L.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Média dos trechos" value={fmtNum(avg, 2)} unit="km/L" tone="data" />
                <Stat label="Trechos válidos" value={String(segments.length)} />
              </div>
              <div className="mt-3">
                {segments.map((s) => (
                  <Row
                    key={s.toId}
                    label={`Até ${fmtDateTime(s.at)}`}
                    value={`${fmtNum(s.kmPerL, 2)} km/L · ${fmtNum(s.distanceKm, 0)} km · ${fmtNum(s.liters, 2)} L`}
                  />
                ))}
              </div>
              <div className="mt-3">
                <Notice>
                  Só entram trechos entre dois enchimentos completos. Abastecimentos parciais
                  aparecem na lista, mas ficam fora do cálculo.
                </Notice>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Registros">
          {db.fuelings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum abastecimento registrado.</p>
          ) : (
            <ul className="space-y-2">
              {db.fuelings.map((f) => (
                <li
                  key={f.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border bg-secondary/30 p-3"
                >
                  <div className="min-w-0">
                    <p className="numeric text-sm">
                      {fmtNum(f.liters, 2, " L")} · {fmtMoney(f.totalValue)} ·{" "}
                      {fmtMoney(f.pricePerLiter)}/L
                    </p>
                    <p className="numeric text-xs text-muted-foreground">
                      {fmtDateTime(f.at)} · hodômetro {f.odometer ?? "—"} km
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.station || "posto não informado"} · {LABELS.fuelType[f.fuelType]} ·{" "}
                      {f.fullTank ? "tanque cheio" : "parcial"}
                    </p>
                    {f.note ? <p className="text-xs text-muted-foreground">{f.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLastId(f.id)}
                      className="text-xs"
                    >
                      Fotos
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Excluir este abastecimento?")) deleteFueling(f.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="label-tec">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
      />
    </label>
  );
}