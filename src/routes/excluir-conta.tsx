import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/dp/AppShell";
import { AccountDeletion } from "@/components/dp/AccountDeletion";
export const Route = createFileRoute("/excluir-conta")({
  head: () => ({ meta: [{ title: "Excluir conta — CARVRUM" }] }),
  component: () => (
    <AppShell title="Excluir conta">
      <AccountDeletion />
    </AppShell>
  ),
});
