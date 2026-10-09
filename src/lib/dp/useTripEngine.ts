import { useCallback, useEffect, useRef, useState } from "react";
import { MS_TO_KMH, validTrackPoint } from "./geo";
import { appendTripPoints, readDb } from "./store";
import { locationAllowed } from "./privacy";
import { localScope } from "./accountScope";
import { isNative, nativeWatch } from "./native";
import type { TrackPoint } from "./types";

export type GeoStatus = "idle" | "solicitando" | "ativo" | "negado" | "indisponivel" | "erro";

const START_SPEED_KMH = 10;
const START_HOLD_MS = 8_000;
const STOP_SPEED_KMH = 3;
const STOP_HOLD_MS = 120_000;
const SNOOZE_MS = 300_000;

export type EngineState = {
  status: GeoStatus;
  errorMessage: string | null;
  currentKmh: number;
  accuracy: number | null;
  lastPoint: TrackPoint | null;
  /** sugestão automática de iniciar viagem (movimento detectado) */
  suggestStart: boolean;
  /** pergunta "continua trafegando?" durante viagem parada */
  askStillDriving: boolean;
};

/**
 * Motor de rastreamento: GPS do navegador ou serviço nativo do Capacitor.
 * LIMITAÇÃO DE PWA: o navegador suspende a leitura de GPS quando a tela é
 * bloqueada ou o app vai para segundo plano no iOS. Precisão contínua em
 * background exigiria app nativo.
 */
export function useTripEngine(activeTripId: string | null) {
  const [state, setState] = useState<EngineState>({
    status: "idle",
    errorMessage: null,
    currentKmh: 0,
    accuracy: null,
    lastPoint: null,
    suggestStart: false,
    askStillDriving: false,
  });

  const watchId = useRef<number | null>(null);
  const nativeStop = useRef<(() => Promise<void>) | null>(null);
  const nativeStarting = useRef(false);
  const watchGeneration = useRef(0);
  const aboveSince = useRef<number | null>(null);
  const belowSince = useRef<number | null>(null);
  const snoozeUntil = useRef<number>(0);
  const activeTripIdRef = useRef<string | null>(activeTripId);
  const flushTimer = useRef<number | null>(null);
  const buffer = useRef<{ scope: string; tripId: string; point: TrackPoint }[]>([]);
  const flushing = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    activeTripIdRef.current = activeTripId;
    belowSince.current = null;
  }, [activeTripId]);

  const flush = useCallback(() => {
    const task = flushing.current
      .catch(() => {})
      .then(async () => {
        const samples = [...buffer.current];
        for (const tripId of new Set(samples.map((s) => s.tripId))) {
          const selected = samples.filter((s) => s.tripId === tripId);
          if (selected[0]?.scope !== localScope())
            throw Error("A conta mudou; pontos anteriores preservados no espaço original.");
          await appendTripPoints(
            tripId,
            selected.map((s) => s.point),
          );
          const removed = new Set(selected);
          buffer.current = buffer.current.filter((s) => !removed.has(s));
        }
      });
    flushing.current = task;
    void task.catch((error) =>
      setState((s) => ({ ...s, status: "erro", errorMessage: error.message })),
    );
    return task;
  }, []);

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      const p: TrackPoint = {
        t: pos.timestamp,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        speed: pos.coords.speed,
        altitude: pos.coords.altitude,
        accuracy: pos.coords.accuracy,
      };
      if (!validTrackPoint(p)) return;
      const kmh = (p.speed ?? 0) > 0 ? (p.speed as number) * MS_TO_KMH : 0;
      const now = Date.now();

      // Read synchronously: React may not have committed the new trip ID yet.
      activeTripIdRef.current = readDb().activeTripId;
      if (activeTripIdRef.current) {
        buffer.current.push({ scope: localScope(), tripId: activeTripIdRef.current, point: p });
        void flush();
        if (kmh < STOP_SPEED_KMH) {
          belowSince.current ??= now;
        } else {
          belowSince.current = null;
        }
      } else {
        if (kmh >= START_SPEED_KMH) {
          aboveSince.current ??= now;
        } else {
          aboveSince.current = null;
        }
      }

      setState((prev) => ({
        ...prev,
        status: "ativo",
        errorMessage: null,
        currentKmh: kmh,
        accuracy: p.accuracy,
        lastPoint: p,
        suggestStart:
          !activeTripIdRef.current &&
          aboveSince.current != null &&
          now - aboveSince.current >= START_HOLD_MS,
        askStillDriving:
          !!activeTripIdRef.current &&
          belowSince.current != null &&
          now - belowSince.current >= STOP_HOLD_MS &&
          now >= snoozeUntil.current,
      }));
    },
    [flush],
  );

  const start = useCallback(() => {
    if (!locationAllowed()) {
      setState((s) => ({
        ...s,
        status: "negado",
        errorMessage: "Autorize o registro de localização antes de ligar o GPS.",
      }));
      return;
    }
    if (isNative()) {
      if (!readDb().activeTripId) {
        setState((s) => ({
          ...s,
          status: "idle",
          errorMessage: "Inicie uma viagem para ligar o GPS nativo.",
        }));
        return;
      }
      if (nativeStop.current || nativeStarting.current) return;
      nativeStarting.current = true;
      const generation = ++watchGeneration.current;
      setState((s) => ({ ...s, status: "solicitando" }));
      void nativeWatch(
        (point) => {
          if (generation !== watchGeneration.current || !locationAllowed()) return;
          onPosition({
            timestamp: point.t,
            coords: {
              latitude: point.lat,
              longitude: point.lon,
              speed: point.speed,
              altitude: point.altitude,
              accuracy: point.accuracy,
            },
          } as GeolocationPosition);
        },
        (message) => setState((s) => ({ ...s, status: "erro", errorMessage: message })),
      )
        .then(async (remove) => {
          if (generation !== watchGeneration.current) await remove();
          else nativeStop.current = remove;
        })
        .catch((e) => {
          if (generation === watchGeneration.current)
            setState((s) => ({ ...s, status: "erro", errorMessage: e.message }));
        })
        .finally(() => {
          nativeStarting.current = false;
        });
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "indisponivel" }));
      return;
    }
    if (watchId.current != null) return;
    setState((s) => ({ ...s, status: "solicitando" }));
    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      (err) => {
        setState((s) => ({
          ...s,
          status: err.code === err.PERMISSION_DENIED ? "negado" : "erro",
          errorMessage: err.message,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
    flushTimer.current = window.setInterval(flush, 5000);
  }, [flush, onPosition]);

  const stop = useCallback(async () => {
    ++watchGeneration.current;
    const remove = nativeStop.current;
    nativeStop.current = null;
    if (remove) await remove();
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (flushTimer.current != null) {
      window.clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    await flush();
    setState((s) => ({ ...s, status: "idle", suggestStart: false, askStillDriving: false }));
  }, [flush]);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  useEffect(() => {
    const persist = () => {
      void flush().catch(() => {});
    };
    const consent = () => {
      if (!locationAllowed()) void stop().catch(() => {});
    };
    window.addEventListener("carvrum:privacy-change", consent);
    window.addEventListener("storage", consent);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("carvrum:privacy-change", consent);
      window.removeEventListener("storage", consent);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [flush, stop]);

  const dismissStartSuggestion = useCallback(() => {
    aboveSince.current = null;
    setState((s) => ({ ...s, suggestStart: false }));
  }, []);

  /** "Continua trafegando" → silencia novo alerta por 5 minutos. */
  const snoozeStillDriving = useCallback(() => {
    snoozeUntil.current = Date.now() + SNOOZE_MS;
    belowSince.current = null;
    setState((s) => ({ ...s, askStillDriving: false }));
  }, []);

  return { state, start, stop, flush, dismissStartSuggestion, snoozeStillDriving };
}
