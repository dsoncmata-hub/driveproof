import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useDb } from "@/lib/dp/store";
import { useTripEngine } from "@/lib/dp/useTripEngine";

const TrackerContext = createContext<ReturnType<typeof useTripEngine> | null>(null);
export function TripTracker({ children }: { children: ReactNode }) {
  const { activeTripId } = useDb();
  const engine = useTripEngine(activeTripId);
  useEffect(() => {
    if (activeTripId) engine.start();
    // Starting is tied to the trip ID; a deliberate pause remains paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripId]);
  return <TrackerContext.Provider value={engine}>{children}</TrackerContext.Provider>;
}
export function useTracker() {
  const tracker = useContext(TrackerContext);
  if (!tracker) throw Error("Rastreador não inicializado.");
  return tracker;
}
