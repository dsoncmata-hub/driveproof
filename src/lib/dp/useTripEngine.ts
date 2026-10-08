import { useCallback, useEffect, useRef, useState } from "react";
import { MS_TO_KMH, tripMetrics, validTrackPoint } from "./geo";
import { patchTrip, readDb } from "./store";
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
 * Motor de rastreamento por GPS do navegador.
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
  const aboveSince = useRef<number | null>(null);
  const belowSince = useRef<number | null>(null);
  const snoozeUntil = useRef<number>(0);
  const activeTripIdRef = useRef<string | null>(activeTripId);
  const flushTimer = useRef<number | null>(null);
  const buffer = useRef<{ tripId: string; point: TrackPoint }[]>([]);

  useEffect(() => {
    activeTripIdRef.current = activeTripId;
    belowSince.current = null;
  }, [activeTripId]);

  const flush = useCallback(() => {
    for (const tripId of new Set(buffer.current.map((sample) => sample.tripId))) {
      const trip = readDb().trips.find((t) => t.id === tripId);
      if (!trip) continue;
      const points = [...trip.points];
      for (const sample of buffer.current.filter((s) => s.tripId === tripId)) {
        if (
          sample.point.t >= trip.startedAt &&
          sample.point.t > (points.at(-1)?.t ?? 0) &&
          (!trip.endedAt || sample.point.t <= trip.endedAt)
        )
          points.push(sample.point);
      }
      patchTrip(tripId, {
        points,
        ...tripMetrics(points, trip.startedAt, trip.endedAt ?? Date.now()),
      });
      buffer.current = buffer.current.filter((s) => s.tripId !== tripId);
    }
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
        buffer.current.push({ tripId: activeTripIdRef.current, point: p });
        flush();
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

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (flushTimer.current != null) {
      window.clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    flush();
    setState((s) => ({ ...s, status: "idle", suggestStart: false, askStillDriving: false }));
  }, [flush]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    const persist = () => flush();
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [flush]);

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
