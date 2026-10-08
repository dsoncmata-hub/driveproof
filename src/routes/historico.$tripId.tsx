import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileDown, Printer, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/dp/AppShell";
import { ChecklistForm } from "@/components/dp/ChecklistForm";
import { EvidenceCapture } from "@/components/dp/EvidenceCapture";
import { EvidenceList } from "@/components/dp/EvidenceList";
import { Notice, Panel, Row, Stat, TrackMap } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/dp/defaults";
import { deviation, tripPhysicalKmPerL } from "@/lib/dp/analysis";
import { exportEvidenceManifestCsv, printToPdf } from "@/lib/dp/exporters";
import { fmtDateTime, fmtDuration, fmtNum, shortHash } from "@/lib/dp/format";
import { buildTripManifest } from "@/lib/dp/manifest";
import { patchTrip, useDb } from "@/lib/dp/store";
import type { TripManifest } from "@/lib/dp/types";

export const Route = createFileRoute("/historico/$tripId")({
  head: () => ({
    meta: [
      { title: "Detalhe da viagem — DriveProof" },
      {
        name: "description",
        content:
          "Dados completos da viagem: trajeto, velocidades, checklist, evidências e manifesto de integridade.",
      },
      { property: "og:title", content: "Detalhe da viagem — DriveProof" },
      {
        property: "og:description",
        content: "Trajeto, condições de teste, evidências com hash e manifesto de integridade.",
      },
    ],
  }),
  component: TripDetail,
});

function TripDetail() {
  const { tripId } = useParams({ from: "/historico/$tripId" });
  const db = useDb();
  const trip = db.trips.find((t) => t.id === tripId) ?? null;
  const evidences = db.evidences.filter((e) => e.tripId === tripId);
  const [manifest, setManifest] = useState<TripManifest | null>(null);

  useEffect(() => {
    if (!trip) return;
    let alive = true;
    void buildTripManifest(trip, evidences).then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, trip?.points.length, evidences.length, trip?.checklist]);

  if (!trip) {
    return (
      <AppShell title="Viagem">
        <Notice>Viagem não encontrada neste aparelho.</Notice>
      </AppShell>
    );
  }

  const physical = tripPhysicalKmPerL(trip);
  const dev = deviation(physical, trip.indicatedKmPerL);
  const duration = ((trip.endedAt ?? Date.now()) - trip.startedAt) / 1000;
  const c = trip.checklist;

  return (
    <AppShell title={trip.label} subtitle={fmtDateTime(trip.startedAt)}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 no-print">
          <Button variant="secondary" className="min-h-12" onClick={printToPdf}>
            <Printer className="size-4" /> PDF / imprimir
          </Button>
          <Button
            variant="secondary"
            className="min-h-12"
            onClick={() => exportEvidenceManifestCsv(db, trip.id)}
          >
            <FileDown className="size-4" /> CSV de evidências
          </Button>
        </div>

        <Panel title="Resumo">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Duração" value={fmtDuration(duration)} />
            <Stat label="Distância GPS" value={fmtNum(trip.distanceKm, 2)} unit="km" tone="data" />
            <Stat label="Velocidade média" value={fmtNum(trip.avgSpeedKmh, 1)} unit="km/h" />
            <Stat label="Velocidade máxima" value={fmtNum(trip.maxSpeedKmh, 1)} unit="km/h" tone="primary" />
          </div>
          <div className="mt-3">
            <Row label="Início" value={fmtDateTime(trip.startedAt)} />
            <Row label="Fim" value={fmtDateTime(trip.endedAt)} />
            <Row label="Pontos de GPS" value={String(trip.points.length)} />
            <Row
              label="Ganho altimétrico"
              value={trip.elevationGainM == null ? "—" : `${trip.elevationGainM} m`}
            />
            <Row
              label="Primeira coordenada"
              value={
                trip.points[0]
                  ? `${trip.points[0].lat.toFixed(5)}, ${trip.points[0].lon.toFixed(5)}`
                  : "—"
              }
            />
          </div>
        </Panel>

        <Panel title="Trajeto">
          <TrackMap points={trip.points} />
        </Panel>

        <Panel title="Consumo declarado">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label-tec">Hodômetro inicial</span>
              <input
                type="number"
                inputMode="decimal"
                value={trip.odometerStart ?? ""}
                onChange={(e) =>
                  patchTrip(trip.id, {
                    odometerStart: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-tec">Hodômetro final</span>
              <input
                type="number"
                inputMode="decimal"
                value={trip.odometerEnd ?? ""}
                onChange={(e) =>
                  patchTrip(trip.id, {
                    odometerEnd: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-tec">Litros consumidos</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={trip.litersUsedEstimate ?? ""}
                onChange={(e) =>
                  patchTrip(trip.id, {
                    litersUsedEstimate: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-tec">Consumo indicado (km/L)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={trip.indicatedKmPerL ?? ""}
                onChange={(e) =>
                  patchTrip(trip.id, {
                    indicatedKmPerL: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Físico" value={fmtNum(physical, 2)} unit="km/L" tone="data" />
            <Stat label="Indicado" value={fmtNum(trip.indicatedKmPerL, 2)} unit="km/L" />
            <Stat
              label="Diferença"
              value={dev ? `${dev.abs > 0 ? "+" : ""}${dev.abs.toFixed(2)}` : "—"}
              unit={dev ? `km/L (${dev.pct > 0 ? "+" : ""}${dev.pct.toFixed(1)}%)` : ""}
              tone="primary"
            />
          </div>
          <div className="mt-3">
            <Notice>
              O consumo indicado é o número que você leu no painel do veículo. A diferença
              mostrada é apenas a comparação entre duas medições, sem conclusão sobre causa.
            </Notice>
          </div>
        </Panel>

        <Panel title="Condições registradas">
          <Row label="Pneus (DE / DD / TE / TD)" value={`${c.tirePressurePsi.frontLeft ?? "—"} / ${c.tirePressurePsi.frontRight ?? "—"} / ${c.tirePressurePsi.rearLeft ?? "—"} / ${c.tirePressurePsi.rearRight ?? "—"} PSI`} />
          <Row label="Medição" value={LABELS.tireMeasuredAt[c.tireMeasuredAt]} />
          <Row
            label="Recomendado (diant./tras.)"
            value={`${c.recommendedFrontPsi ?? "—"} / ${c.recommendedRearPsi ?? "—"} PSI`}
          />
          <Row label="Ocupantes / carga" value={`${c.occupants ?? "—"} / ${c.estimatedLoadKg ?? "—"} kg`} />
          <Row label="Ar-condicionado" value={c.acOn ? `ligado ${c.acTempC ?? "—"} °C` : "desligado"} />
          <Row label="Temperatura ambiente" value={c.ambientTempC == null ? "—" : `${c.ambientTempC} °C`} />
          <Row label="Nível inicial" value={c.initialFuelLevelPct == null ? "—" : `${c.initialFuelLevelPct}%`} />
          <Row label="Combustível" value={LABELS.fuelType[c.fuelType]} />
          <Row label="Partida a frio" value={c.coldStart ? "sim" : "não"} />
          <Row label="Modo de condução" value={LABELS.driveMode[c.driveMode]} />
          <Row label="Janelas" value={LABELS.windows[c.windows]} />
          <Row label="Via" value={LABELS.roadCondition[c.roadCondition]} />
          <Row label="Trânsito" value={LABELS.traffic[c.traffic]} />
          <Row label="Trajeto" value={LABELS.routeType[c.routeType]} />
          {c.notes ? <Row label="Observações" value={c.notes} /> : null}
        </Panel>

        <details className="panel p-4 no-print">
          <summary className="label-tec cursor-pointer">Editar condições desta viagem</summary>
          <div className="mt-4">
            <ChecklistForm
              value={trip.checklist}
              onChange={(next) => patchTrip(trip.id, { checklist: next })}
            />
          </div>
        </details>

        <Panel title="Evidências">
          <div className="no-print">
            <EvidenceCapture tripId={trip.id} defaultCategory="evento" />
          </div>
          <div className="mt-4">
            <EvidenceList items={evidences} />
          </div>
        </Panel>

        <Panel title="Manifesto de integridade">
          {manifest ? (
            <div>
              <Row label="Gerado em" value={fmtDateTime(manifest.generatedAt)} />
              <Row label="Versão do app" value={manifest.appVersion} />
              <Row label="Arquivos no manifesto" value={String(manifest.entries.length)} />
              <Row label="Hash do trajeto" value={shortHash(manifest.trackHash)} />
              <Row label="Hash do manifesto" value={shortHash(manifest.manifestHash)} />
              <div className="mt-3">
                <Notice>
                  <ShieldCheck className="mr-1 inline size-3" />
                  O manifesto lista os hashes SHA-256 das evidências e do trajeto. Ele
                  demonstra que os registros não mudaram desde a captura neste aparelho; não
                  é laudo nem prova pericial.
                </Notice>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Calculando hashes…</p>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}