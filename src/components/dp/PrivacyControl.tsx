import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { locationAllowed, setLocationConsent } from "@/lib/dp/privacy";
import { useTracker } from "./TripTracker";
export function PrivacyControl() {
  const [allowed, setAllowed] = useState(locationAllowed);
  const tracker = useTracker();
  useEffect(() => {
    const refresh = () => setAllowed(locationAllowed());
    window.addEventListener("carvrum:privacy-change", refresh);
    return () => window.removeEventListener("carvrum:privacy-change", refresh);
  }, []);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="font-semibold">Localização durante a viagem</p>
      <p className="text-sm text-muted-foreground">
        O CARVRUM registra localização, horário, precisão e velocidade para calcular o trajeto e o
        consumo. No aplicativo nativo, o registro pode continuar em segundo plano e com a tela
        bloqueada enquanto a viagem está ativa. Você pode pausar o GPS ou revogar esta opção a
        qualquer momento.
      </p>
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          checked={allowed}
          onChange={(e) => {
            setLocationConsent(e.target.checked);
            setAllowed(e.target.checked);
            if (!e.target.checked) void tracker.stop();
          }}
        />
        Permito registrar minha localização durante viagens
      </label>
      <p className="text-xs">
        Envio à nuvem depende da opção de sincronização e do envio de fotos.{" "}
        <Link to="/privacidade" className="underline">
          Privacidade e meus dados
        </Link>
      </p>
    </div>
  );
}
