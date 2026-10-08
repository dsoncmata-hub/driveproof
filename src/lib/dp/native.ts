import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { TrackPoint } from "./types";
export const isNative = () => Capacitor.isNativePlatform();
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
export async function nativeWatch(
  onPoint: (point: TrackPoint) => void,
  onError: (message: string) => void,
): Promise<() => Promise<void>> {
  if (Capacitor.getPlatform() === "android") {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted")
      throw Error("Autorize a notificação de viagem para manter o GPS em segundo plano.");
  }
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: "CARVRUM · viagem em andamento",
      backgroundMessage:
        "Localização registrada durante esta viagem. Abra o CARVRUM para pausar ou encerrar.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 5,
    },
    (location, error) => {
      if (error) {
        onError(error.message);
        return;
      }
      if (!location || location.time === null) return;
      onPoint({
        t: location.time,
        lat: location.latitude,
        lon: location.longitude,
        speed: location.speed === null || location.speed < 0 ? null : location.speed,
        altitude: location.altitude,
        accuracy: location.accuracy,
      });
    },
  );
  return () => BackgroundGeolocation.removeWatcher({ id });
}
