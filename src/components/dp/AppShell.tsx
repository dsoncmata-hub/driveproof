import { Link, useRouterState } from "@tanstack/react-router";
import { Car, Fuel, FlaskConical, History, Home } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Início", icon: Home },
  { to: "/viagem", label: "Viagem", icon: Car },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/abastecimentos", label: "Abastec.", icon: Fuel },
  { to: "/relatorios", label: "Relatórios", icon: FlaskConical },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  action?: ReactNode | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur no-print">
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="min-w-0">
            <p className="label-tec">CARVRUM · registro técnico</p>
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {children}
        <footer className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacidade" className="underline">
            Privacidade
          </Link>
          <Link to="/termos" className="underline">
            Condições de uso
          </Link>
          <Link to="/excluir-conta" className="underline">
            Excluir conta
          </Link>
        </footer>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/98 backdrop-blur safe-bottom no-print">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
