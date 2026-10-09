import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dp/primitives";

type Fix = { latitude: number; longitude: number; timestamp: number };
type Metrics = {
  startedAt: number | null; seconds: number; status: string;
  points: number; distanceKm: number; speedKmh: number; accuracyM: number | null;
  discarded: number; error: string | null;
};
const INITIAL: Metrics = {
  startedAt: null, seconds: 0, status: "Parado", points: 0,
  distanceKm: 0, speedKmh: 0, accuracyM: null, discarded: 0, error: null,
};
function distanceMeters(a: Fix, b: Fix) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const t = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t));
}
export function LiveGpsTest({ onResult }: { onResult: (values: Record<string, string>) => void }) {
  const [metrics, setMetrics] = useState<Metrics>(INITIAL);
  const [running, setRunning] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<Fix | null>(null);
  const latest = useRef<Metrics>(INITIAL);
  const started = useRef<number | null>(null);
  const update = (next: Metrics) => { latest.current = next; setMetrics(next); };
  const finish = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setRunning(false);
    const end = Date.now();
    const m = latest.current;
    const summary = { ...m, seconds: started.current ? Math.floor((end - started.current) / 1000) : m.seconds, status: "Encerrado" };
    update(summary);
    onResult({
      gps_distance: summary.distanceKm.toFixed(3),
      gps_points: String(summary.points),
      duration: (summary.seconds / 60).toFixed(2),
      qa_gps_accuracy_m: summary.accuracyM?.toFixed(1) ?? "",
      qa_gps_discarded: String(summary.discarded),
      qa_gps_status: summary.error ? "erro" : "concluido",
    });
  };
  const start = () => {
    if (!("geolocation" in navigator)) {
      update({ ...INITIAL, status: "Indisponível", error: "Este navegador não fornece localização." });
      return;
    }
    const now = Date.now();
    started.current = now;
    lastFix.current = null;
    update({ ...INITIAL, startedAt: now, status: "Aguardando localização…" });
    setRunning(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || accuracy > 100) {
          update({ ...latest.current, discarded: latest.current.discarded + 1, status: "Precisão insuficiente" });
          return;
        }
        const fix = { latitude, longitude, timestamp: position.timestamp };
        const previous = lastFix.current;
        let meters = 0;
        if (previous) {
          const deltaS = (fix.timestamp - previous.timestamp) / 1000;
          const candidate = distanceMeters(previous, fix);
          if (deltaS <= 0 || candidate / deltaS * 3.6 > 180) {
            update({ ...latest.current, discarded: latest.current.discarded + 1, status: "Ponto inconsistente descartado" });
            return;
          }
          if (candidate >= 5) meters = candidate;
        }
        lastFix.current = fix;
        update({
          ...latest.current, status: "GPS recebendo pontos", error: null,
          points: latest.current.points + 1,
          distanceKm: latest.current.distanceKm + meters / 1000,
          speedKmh: speed != null && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : previous && fix.timestamp > previous.timestamp ? meters / ((fix.timestamp - previous.timestamp) / 1000) * 3.6 : 0,
          accuracyM: accuracy,
        });
      },
      (error) => {
        const message = error.code === 1 ? "Permissão de localização negada." :
          error.code === 2 ? "Localização indisponível." : "Tempo esgotado aguardando GPS.";
        update({ ...latest.current, error: message, status: "Falha na localização" });
        if (error.code === 1) {
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null; setRunning(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const current = latest.current;
      if (started.current) update({ ...current, seconds: Math.floor((Date.now() - started.current) / 1000) });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
  }, []);
  const elapsed = `${Math.floor(metrics.seconds / 60).toString().padStart(2,"0")}:${(metrics.seconds % 60).toString().padStart(2,"0")}`;
  return <Panel title="Monitor GPS em tempo real">
    <p role="status" className="text-sm">{metrics.status}</p>
    {metrics.error && <p role="alert" className="mt-2 text-sm text-destructive">{metrics.error}</p>}
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
      <div><p className="text-muted-foreground">Tempo</p><p className="text-2xl font-semibold tabular-nums">{elapsed}</p></div>
      <div><p className="text-muted-foreground">Pontos GPS</p><p className="text-2xl font-semibold tabular-nums">{metrics.points}</p></div>
      <div><p className="text-muted-foreground">Distância</p><p className="text-2xl font-semibold tabular-nums">{metrics.distanceKm.toFixed(3)} km</p></div>
      <div><p className="text-muted-foreground">Velocidade</p><p className="text-2xl font-semibold tabular-nums">{metrics.speedKmh.toFixed(1)} km/h</p></div>
      <div><p className="text-muted-foreground">Precisão GPS</p><p className="text-lg font-semibold">{metrics.accuracyM == null ? "—" : "±" + metrics.accuracyM.toFixed(0) + " m"}</p></div>
      <div><p className="text-muted-foreground">Pontos descartados</p><p className="text-lg font-semibold">{metrics.discarded}</p></div>
    </div>
    <div className="mt-4 flex gap-2">
      {!running ? <Button type="button" onClick={start}>Iniciar teste GPS</Button> :
        <Button type="button" variant="destructive" onClick={finish}>Encerrar e registrar medições</Button>}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">
      Teste diagnóstico isolado: não cria viagem nem envia sua localização. No navegador, o GPS pode parar ao bloquear a tela ou colocar o app em segundo plano. Use um passageiro para operar durante deslocamentos. Pontos com precisão pior que 100 m e saltos incompatíveis são descartados.
    </p>
  </Panel>;
}
