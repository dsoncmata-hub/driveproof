import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Play, Radar, Square, Satellite, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dp/AppShell";
import { ChecklistForm } from "@/components/dp/ChecklistForm";
import { EvidenceCapture } from "@/components/dp/EvidenceCapture";
import { EvidenceList } from "@/components/dp/EvidenceList";
import { DrivingWarning, Notice, Panel, Stat, TrackMap } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { defaultChecklist } from "@/lib/dp/defaults";
import { fmtDuration, fmtNum } from "@/lib/dp/format";
import { createTrip, deleteTrip, finishTrip, patchTrip, useDb } from "@/lib/dp/store";
import { useTripEngine } from "@/lib/dp/useTripEngine";
import type { Checklist } from "@/lib/dp/types";

export const Route = createFileRoute("/viagem")({
  head: () => ({
    meta: [
      { title: "Viagem em andamento — DriveProof" },
      {
        name: "description",
        content:
          "Cronômetro, distância por GPS, velocidades, trajeto e captura de evidências durante a viagem.",
      },
      { property: "og:title", content: "Viagem em andamento — DriveProof" },
      {
        property: "og:description",
        content: "Registro de viagem com GPS, checklist de teste controlado e evidências com hash.",
      },
    ],
  }),
  component: ViagemPage,
});

const STATUS_TEXT: Record<string, string> = {
  idle: "GPS parado",
  solicitando: "Solicitando permissão de localização…",
  ativo: "GPS ativo",
  negado: "Permissão de localização negada",
  indisponivel: "GPS indisponível neste navegador",
  erro: "Erro de localização",
};

function ViagemPage() {
  const db = useDb();
  const navigate = useNavigate();
  const activeTrip = db.trips.find((t) => t.id === db.activeTripId) ?? null;
  const engine = useTripEngine(activeTrip?.id ?? null);
  const [checklist, setChecklist] = useState<Checklist>(() => defaultChecklist(db.vehicle));
  const [odometerStart, setOdometerStart] = useState<string>("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    if (!activeTrip) setChecklist((c) => ({ ...c, ...defaultChecklist(db.vehicle), ...c }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.vehicle.recommendedFrontPsi, db.vehicle.recommendedRearPsi]);

  const evidences = useMemo(
    () => db.evidences.filter((e) => activeTrip && e.tripId === activeTrip.id),
    [db.evidences, activeTrip],
  );

  const elapsed = activeTrip ? (Date.now() - activeTrip.startedAt) / 1000 : 0;

  function handleStart() {
    const trip = createTrip({
      checklist,
      odometerStart: odometerStart === "" ? null : Number(odometerStart),
    });
    engine.dismissStartSuggestion();
    engine.start();
    toast.success("Viagem iniciada", { description: trip.label });
  }

  function handleFinish() {
    if (!activeTrip) return;
    // A GPS-only trip can finish without odometer readings, but only if
    // actual distance was captured. A trip started with an odometer reading
    // must have a valid final reading to preserve evidentiary consistency.
    const start = activeTrip.odometerStart;
    const end = activeTrip.odometerEnd;
    if (start != null && (!Number.isFinite(end) || end == null || end <= start)) {
      toast.error("Informe um hodômetro final maior que o inicial antes de encerrar.");
      return;
    }
    if (start == null && !(activeTrip.distanceKm > 0)) {
      toast.error("Sem distância GPS, informe o hodômetro inicial e final para encerrar.");
      return;
    }
    engine.flush();
    engine.stop();
    finishTrip(activeTrip.id);
    patchTrip(activeTrip.id, { endedAt: Date.now() });
    toast.success("Viagem encerrada");
    navigate({ to: "/historico/$tripId", params: { tripId: activeTrip.id } });
  }

  function handleDiscardEmptyTrip() {
    if (!activeTrip) return;
    const hasEvidence = db.evidences.some((item) => item.tripId === activeTrip.id);
    const hasFueling = db.fuelings.some((item) => item.tripId === activeTrip.id);
    const hasMeasurements =
      activeTrip.points.length > 0 ||
      activeTrip.distanceKm > 0 ||
      hasEvidence ||
      hasFueling;
    if (hasMeasurements) {
      toast.error("Esta viagem possui medições ou registros associados e não pode ser descartada.");
      return;
    }
    if (!window.confirm("Descartar esta viagem vazia? Esta ação exclui apenas o rascunho sem registros e não pode ser desfeita.")) return;
    engine.stop();
    deleteTrip(activeTrip.id);
    toast.success("Viagem vazia descartada");
    navigate({ to: "/" });
  }

  return (
    <AppShell
      title={activeTrip ? "Viagem em andamento" : "Nova viagem"}
      subtitle={STATUS_TEXT[engine.state.status]}
    >
      <div className="space-y-4">
        <DrivingWarning />

        <Panel title="Sensor de movimento">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="numeric text-3xl font-semibold text-data">
                {fmtNum(engine.state.currentKmh, 1)}
                <span className="ml-1 text-xs text-muted-foreground">km/h</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUS_TEXT[engine.state.status]}
                {engine.state.accuracy != null
                  ? ` · precisão ±${engine.state.accuracy.toFixed(0)} m`
                  : ""}
              </p>
            </div>
            <Button
              variant={engine.state.status === "ativo" ? "secondary" : "default"}
              className="min-h-12 shrink-0"
              onClick={() => (engine.state.status === "ativo" ? engine.stop() : engine.start())}
            >
              {engine.state.status === "ativo" ? (
                <>
                  <Satellite className="size-5" /> Pausar GPS
                </>
              ) : (
                <>
                  <Radar className="size-5" /> Ligar GPS
                </>
              )}
            </Button>
          </div>
          {engine.state.status === "negado" || engine.state.status === "indisponivel" ? (
            <div className="mt-3">
              <Notice tone="warning">
                Sem acesso ao GPS o app continua registrando checklist, fotos e
                abastecimentos, mas não calcula distância nem velocidade.
              </Notice>
            </div>
          ) : null}
        </Panel>

        {!activeTrip && engine.state.suggestStart ? (
          <Panel>
            <p className="text-sm font-medium">
              Movimento detectado acima de 10 km/h por mais de 8 segundos.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="min-h-14" onClick={handleStart}>
                Iniciar viagem
              </Button>
              <Button
                variant="secondary"
                className="min-h-14"
                onClick={engine.dismissStartSuggestion}
              >
                Agora não
              </Button>
            </div>
          </Panel>
        ) : null}

        {activeTrip && engine.state.askStillDriving ? (
          <Panel>
            <p className="text-sm font-medium">
              Velocidade abaixo de 3 km/h por 2 minutos. Continua trafegando?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="min-h-14" onClick={engine.snoozeStillDriving}>
                Continua trafegando
              </Button>
              <Button variant="destructive" className="min-h-14" onClick={handleFinish}>
                Encerrar viagem
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Ao confirmar que continua, o aviso fica silenciado por 5 minutos.
            </p>
          </Panel>
        ) : null}

        {activeTrip ? (
          <>
            <Panel title="Medições em tempo real" right={<span className="numeric text-xs">{tick % 2 === 0 ? "●" : "○"}</span>}>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Tempo" value={fmtDuration(elapsed)} />
                <Stat label="Distância GPS" value={fmtNum(activeTrip.distanceKm, 2)} unit="km" tone="data" />
                <Stat label="Velocidade atual" value={fmtNum(engine.state.currentKmh, 1)} unit="km/h" />
                <Stat label="Média" value={fmtNum(activeTrip.avgSpeedKmh, 1)} unit="km/h" />
                <Stat label="Máxima" value={fmtNum(activeTrip.maxSpeedKmh, 1)} unit="km/h" tone="primary" />
                <Stat
                  label="Ganho altimétrico"
                  value={activeTrip.elevationGainM == null ? "—" : String(activeTrip.elevationGainM)}
                  unit="m"
                  tone="muted"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Pontos registrados: {activeTrip.points.length} · início{" "}
                {new Date(activeTrip.startedAt).toLocaleString("pt-BR")}
              </p>
            </Panel>

            <Panel title="Trajeto">
              <TrackMap points={activeTrip.points} />
            </Panel>

            <Panel title="Evidências desta viagem">
              <EvidenceCapture tripId={activeTrip.id} defaultCategory="painel" />
              <div className="mt-4">
                <EvidenceList items={evidences} />
              </div>
            </Panel>

            <Panel title="Encerrar">
              <label className="block">
                <span className="label-tec">Hodômetro final (km)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={activeTrip.odometerStart ?? 0}
                  value={activeTrip.odometerEnd ?? ""}
                  onChange={(e) =>
                    patchTrip(activeTrip.id, {
                      odometerEnd: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {activeTrip.odometerStart != null
                  ? "Obrigatório: hodômetro final maior que o inicial."
                  : "Sem hodômetro inicial, é necessário ter distância registrada pelo GPS."}
              </p>
              <Button variant="destructive" className="mt-3 min-h-16 w-full text-base" onClick={handleFinish}>
                <Square className="size-5" /> Encerrar viagem
              </Button>
              <Button variant="outline" className="mt-3 min-h-12 w-full" onClick={handleDiscardEmptyTrip}>
                <Trash2 className="size-4" /> Descartar viagem vazia
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Só é possível descartar viagens sem GPS, evidências ou abastecimentos vinculados.
                Viagens com registros permanecem preservadas. Os dados ficam neste aparelho.
              </p>
            </Panel>
          </>
        ) : (
          <>
            <Panel title="Antes de iniciar">
              <label className="block">
                <span className="label-tec">Hodômetro inicial (km)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={odometerStart}
                  onChange={(e) => setOdometerStart(e.target.value)}
                  className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
                />
              </label>
              <Button className="mt-3 min-h-16 w-full text-base" onClick={handleStart}>
                <Play className="size-6" /> Iniciar viagem agora
              </Button>
            </Panel>

            <h2 className="pt-2 text-sm font-semibold">Checklist de teste controlado</h2>
            <ChecklistForm value={checklist} onChange={setChecklist} />
          </>
        )}
      </div>
    </AppShell>
  );
}