import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { AppShell } from "@/components/dp/AppShell";
import { Notice, Panel, Row, Stat } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { comparability, deviation, tankToTankConsumption, tripPhysicalKmPerL } from "@/lib/dp/analysis";
import {
  exportEvidenceManifestCsv,
  exportFuelingsCsv,
  exportTripsCsv,
  printToPdf,
} from "@/lib/dp/exporters";
import { fmtDateTime, fmtNum } from "@/lib/dp/format";
import { useDb } from "@/lib/dp/store";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios e comparabilidade — DriveProof" },
      {
        name: "description",
        content:
          "Compare viagens, veja consumo físico contra o indicado pelo veículo e exporte os registros em CSV ou PDF.",
      },
      { property: "og:title", content: "Relatórios e comparabilidade — DriveProof" },
      {
        property: "og:description",
        content: "Índice de comparabilidade explicável, desvios de consumo e exportação de dados.",
      },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const db = useDb();
  const trips = db.trips.filter((t) => t.finished);
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");

  const a = trips.find((t) => t.id === aId) ?? trips[0] ?? null;
  const b = trips.find((t) => t.id === bId) ?? trips[1] ?? null;
  const comp = a && b && a.id !== b.id ? comparability(a, b) : null;
  const segments = tankToTankConsumption(db.fuelings);

  return (
    <AppShell title="Relatórios" subtitle="Comparação explicável entre viagens">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 no-print">
          <Button variant="secondary" className="min-h-12" onClick={printToPdf}>
            <Printer className="size-4" /> PDF / imprimir
          </Button>
          <Button variant="secondary" className="min-h-12" onClick={() => exportTripsCsv(db)}>
            <FileDown className="size-4" /> CSV de viagens
          </Button>
          <Button variant="secondary" className="min-h-12" onClick={() => exportFuelingsCsv(db)}>
            <FileDown className="size-4" /> CSV abastecimentos
          </Button>
          <Button
            variant="secondary"
            className="min-h-12"
            onClick={() => exportEvidenceManifestCsv(db)}
          >
            <FileDown className="size-4" /> CSV evidências
          </Button>
        </div>
        <Notice>
          O PDF é gerado pelo próprio navegador: escolha “Salvar como PDF” na janela de
          impressão. É o caminho disponível em um app web no iPhone.
        </Notice>

        <Panel title="Consumo por viagem">
          {trips.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma viagem encerrada ainda.</p>
          ) : (
            trips.map((t) => {
              const phys = tripPhysicalKmPerL(t);
              const dev = deviation(phys, t.indicatedKmPerL);
              return (
                <div

                  key={t.id}
                  className="border-b border-border/60 py-3 last:border-0 last:pb-0 first:pt-0"
                >
                  <p className="truncate text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(t.startedAt)}</p>
                  <p className="numeric mt-1 text-sm">
                    físico {fmtNum(phys, 2)} · indicado {fmtNum(t.indicatedKmPerL, 2)} km/L
                    {dev ? (
                      <span className={dev.pct >= 0 ? "text-warning" : "text-data"}>
                        {" "}
                        ({dev.pct > 0 ? "+" : ""}
                        {dev.pct.toFixed(1)}%)
                      </span>
                    ) : null}
                  </p>
                </div>
              );

            })
          )}
        </Panel>

        <Panel title="Comparar duas viagens">
          <div className="grid grid-cols-2 gap-3 no-print">
            <TripSelect label="Viagem A" trips={trips} value={a?.id ?? ""} onChange={setAId} />
            <TripSelect label="Viagem B" trips={trips} value={b?.id ?? ""} onChange={setBId} />
          </div>

          {!comp ? (
            <div className="mt-3">
              <Notice>Selecione duas viagens diferentes para comparar.</Notice>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Índice de comparabilidade"
                  value={String(comp.score)}
                  unit="/100"
                  tone={comp.score >= 75 ? "data" : "primary"}
                />
                <Stat label="Variáveis sem dado" value={String(comp.unknownCount)} tone="muted" />
              </div>

              <div className="space-y-2">
                {comp.factors
                  .slice()
                  .sort((x, y) => x.score - y.score)
                  .map((f) => (
                    <div key={f.name} className="rounded-md border border-border bg-secondary/30 p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{f.name}</p>
                        <p className="numeric shrink-0 text-sm">
                          {Math.round(f.score * 100)}%{" "}
                          <span className="text-xs text-muted-foreground">peso {f.weight}</span>
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded bg-border">
                        <div
                          className={`h-full ${f.score >= 0.8 ? "bg-success" : f.score >= 0.5 ? "bg-data" : "bg-warning"}`}
                          style={{ width: `${Math.max(2, f.score * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                    </div>
                  ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat label={`A · ${a!.label}`} value={fmtNum(tripPhysicalKmPerL(a!), 2)} unit="km/L" />
                <Stat label={`B · ${b!.label}`} value={fmtNum(tripPhysicalKmPerL(b!), 2)} unit="km/L" />
              </div>

              <Notice tone={comp.score < 70 ? "warning" : "info"}>
                {comp.score < 70
                  ? "Comparabilidade baixa: as condições das duas viagens são diferentes o bastante para que a diferença de consumo não possa ser atribuída ao veículo. Os fatores com menor pontuação acima indicam o que divergiu."
                  : "Condições razoavelmente próximas. Ainda assim, o app não corrige matematicamente o consumo em função das variáveis."}
              </Notice>
            </div>
          )}
        </Panel>

        <Panel title="Bomba-a-bomba">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem trechos entre tanques cheios suficientes.
            </p>
          ) : (
            segments.map((s) => (
              <Row
                key={s.toId}
                label={`Trecho até ${fmtDateTime(s.at)}`}
                value={`${fmtNum(s.kmPerL, 2)} km/L`}
              />
            ))
          )}
        </Panel>

        <Panel title="Evidências no período">
          <Row label="Total de arquivos" value={String(db.evidences.length)} />
          <Row
            label="Capturados no app"
            value={String(db.evidences.filter((e) => e.inAppCapture).length)}
          />
          <Row
            label="Com coordenada"
            value={String(db.evidences.filter((e) => e.lat != null).length)}
          />
        </Panel>

        <Notice tone="warning">
          Este relatório é um registro de medições e condições declaradas. Não é diagnóstico
          automotivo nem prova pericial.
        </Notice>
      </div>
    </AppShell>
  );
}

function TripSelect({
  label,
  trips,
  value,
  onChange,
}: {
  label: string;
  trips: Array<{ id: string; label: string; startedAt: number }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="label-tec">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-sm outline-none focus:border-ring"
      >
        <option value="">Selecione…</option>
        {trips.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label} — {new Date(t.startedAt).toLocaleDateString("pt-BR")}
          </option>
        ))}
      </select>
    </label>
  );
}