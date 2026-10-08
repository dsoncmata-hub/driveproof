import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Car, Database, Fuel, History, Play, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/dp/AppShell";
import { CloudAccount } from "@/components/dp/CloudAccount";
import { Notice, Panel, Stat } from "@/components/dp/primitives";
import { Button } from "@/components/ui/button";
import { seedDemoData } from "@/lib/dp/demo";
import { fmtNum } from "@/lib/dp/format";
import { setVehicle, useDb } from "@/lib/dp/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CARVRUM — registro técnico de viagens e consumo" },
      {
        name: "description",
        content:
          "Registre viagens, evidências com hash SHA-256, abastecimentos e variáveis que afetam o consumo de combustível, com rastreabilidade técnica.",
      },
      { property: "og:title", content: "CARVRUM — registro técnico de viagens e consumo" },
      {
        property: "og:description",
        content:
          "Viagens por GPS, checklist de teste controlado, evidências com hash e relatórios comparáveis.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const db = useDb();
  const navigate = useNavigate();
  const activeTrip = db.trips.find((t) => t.id === db.activeTripId) ?? null;
  const totalKm = db.trips.reduce((a, t) => a + t.distanceKm, 0);

  return (
    <AppShell title="Início" subtitle={db.vehicle.name}>
      <div className="space-y-4">
        <CloudAccount />
        <Notice tone="warning">
          O CARVRUM registra evidências e condições de teste. Ele não faz diagnóstico automotivo nem
          produz prova pericial.
        </Notice>

        {activeTrip ? (
          <Panel title="Viagem em andamento">
            <p className="text-sm text-muted-foreground">
              {activeTrip.label} · {fmtNum(activeTrip.distanceKm, 2, " km")} registrados
            </p>
            <Button
              className="mt-3 min-h-14 w-full text-base"
              onClick={() => navigate({ to: "/viagem" })}
            >
              <Car className="size-5" /> Retomar viagem
            </Button>
          </Panel>
        ) : null}

        <div className="grid grid-cols-1 gap-3">
          <Button
            size="lg"
            className="min-h-20 justify-start text-lg"
            onClick={() => navigate({ to: "/viagem" })}
          >
            <Play className="size-6" /> {activeTrip ? "Abrir viagem" : "Iniciar viagem"}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button asChild size="lg" variant="secondary" className="min-h-20 flex-col gap-1">
              <Link to="/historico">
                <History className="size-6" />
                Histórico
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="min-h-20 flex-col gap-1">
              <Link to="/abastecimentos">
                <Fuel className="size-6" />
                Abastecimentos
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="min-h-20 flex-col gap-1">
              <Link to="/relatorios">
                <ShieldCheck className="size-6" />
                Relatórios
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="min-h-20 flex-col gap-1">
              <Link to="/metodologia">
                <BookOpen className="size-6" />
                Metodologia
              </Link>
            </Button>
          </div>
        </div>

        <Panel title="Resumo local">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Viagens" value={String(db.trips.length)} />
            <Stat label="Distância" value={fmtNum(totalKm, 1)} unit="km" tone="data" />
            <Stat label="Evidências" value={String(db.evidences.length)} tone="primary" />
          </div>
        </Panel>

        <Panel title="Veículo e pressões de referência">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block">
              <span className="label-tec">Nome do veículo</span>
              <input
                value={db.vehicle.name}
                onChange={(e) => setVehicle({ ...db.vehicle, name: e.target.value })}
                className="mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-tec">PSI recomendado diant.</span>
              <input
                type="number"
                inputMode="decimal"
                value={db.vehicle.recommendedFrontPsi ?? ""}
                onChange={(e) =>
                  setVehicle({
                    ...db.vehicle,
                    recommendedFrontPsi: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-tec">PSI recomendado tras.</span>
              <input
                type="number"
                inputMode="decimal"
                value={db.vehicle.recommendedRearPsi ?? ""}
                onChange={(e) =>
                  setVehicle({
                    ...db.vehicle,
                    recommendedRearPsi: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="numeric mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 text-base outline-none focus:border-ring"
              />
            </label>
          </div>
          <Notice>
            Esses valores vêm da etiqueta/manual do seu veículo e são informados por você. O app
            apenas compara as medições com o que você cadastrou.
          </Notice>
        </Panel>

        <Panel title="Dados de demonstração">
          <Button
            variant="secondary"
            className="min-h-14 w-full"
            onClick={() => {
              seedDemoData(true);
              toast.success("Dados de demonstração carregados");
            }}
          >
            <Database className="size-5" /> Carregar viagens e abastecimentos de exemplo
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Cria 3 viagens e 4 abastecimentos fictícios para você testar comparação, relatórios e
            exportação.
          </p>
        </Panel>

        <Notice>
          Limitações de PWA no iPhone: o GPS pausa quando o app sai da tela ou o telefone é
          bloqueado, e a câmera do navegador tem menos controle que a nativa. Registro contínuo em
          segundo plano exigiria um app nativo iOS. Todos os dados ficam neste aparelho.
        </Notice>
      </div>
    </AppShell>
  );
}
