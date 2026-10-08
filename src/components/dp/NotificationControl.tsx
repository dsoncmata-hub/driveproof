import { Button } from "@/components/ui/button";
import { notificationsActive, setNotifPause, useDb } from "@/lib/dp/store";

const HOUR = 3_600_000;

export function NotificationControl() {
  const db = useDb();
  const active = notificationsActive(db);
  const u = db.notifPausedUntil;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {active
          ? "Alertas ativos."
          : u === -1
            ? "Alertas pausados até você reativar."
            : `Alertas pausados até ${new Date(u as number).toLocaleString("pt-BR")}.`}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" className="min-h-12" onClick={() => setNotifPause(Date.now() + 24 * HOUR)}>Pausar por 24 horas</Button>
        <Button variant="secondary" className="min-h-12" onClick={() => setNotifPause(Date.now() + 7 * 24 * HOUR)}>Pausar por 7 dias</Button>
        <Button variant="secondary" className="min-h-12" onClick={() => setNotifPause(-1)}>Pausar até eu reativar</Button>
        <Button className="min-h-12" onClick={() => setNotifPause(null)}>Reativar notificações agora</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pausar só esconde alertas. O registro de dados que você já autorizou (GPS da viagem,
        abastecimentos) continua normalmente.
      </p>
    </div>
  );
}