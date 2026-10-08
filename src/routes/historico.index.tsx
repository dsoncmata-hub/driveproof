import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Trash2 } from "lucide-react";
import { AppShell } from "@/components/dp/AppShell";
import { Notice, Panel } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/dp/defaults";
import { fmtDateTime, fmtNum } from "@/lib/dp/format";
import { deleteTrip, useDb } from "@/lib/dp/store";

export const Route = createFileRoute("/historico/")({
  head: () => ({
    meta: [
      { title: "Histórico de viagens — DriveProof" },
      {
        name: "description",
        content: "Todas as viagens registradas com distância, velocidades, condições e evidências.",
      },
      { property: "og:title", content: "Histórico de viagens — DriveProof" },
      {
        property: "og:description",
        content: "Consulte viagens registradas, condições de teste e evidências associadas.",
      },
    ],
  }),
  component: Historico,
});

function Historico() {
  const db = useDb();

  return (
    <AppShell title="Histórico" subtitle={`${db.trips.length} viagem(ns) registrada(s)`}>
      <div className="space-y-3">
        {db.trips.length === 0 ? (
          <Notice>
            Nenhuma viagem registrada. Inicie uma viagem ou carregue os dados de
            demonstração na tela inicial.
          </Notice>
        ) : null}

        {db.trips.map((t) => {
          const evCount = db.evidences.filter((e) => e.tripId === t.id).length;
          return (
            <Panel key={t.id} className="p-0">
              <Link
                to="/historico/$tripId"
                params={{ tripId: t.id }}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{t.label}</p>
                    {!t.finished ? (
                      <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        em andamento
                      </span>
                    ) : null}
                  </div>
                  <p className="numeric text-xs text-muted-foreground">{fmtDateTime(t.startedAt)}</p>
                  <p className="numeric mt-1 text-sm text-data">
                    {fmtNum(t.distanceKm, 2, " km")} · méd. {fmtNum(t.avgSpeedKmh, 0, " km/h")} ·
                    máx. {fmtNum(t.maxSpeedKmh, 0, " km/h")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {LABELS.routeType[t.checklist.routeType]} ·{" "}
                    {LABELS.traffic[t.checklist.traffic]} ·{" "}
                    {t.checklist.acOn ? "AC ligado" : "AC desligado"} · {evCount} evidência(s)
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
              <div className="border-t border-border px-4 py-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Excluir "${t.label}" e suas evidências?`)) deleteTrip(t.id);
                  }}
                >
                  <Trash2 className="size-4" /> Excluir
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </AppShell>
  );
}