import { deleteNativeExports } from "@/lib/dp/exporters";
import { authRedirect } from "@/lib/dp/nativeAuth";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "./AccountProvider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/dp/supabase";
import { deleteLocalScope } from "@/lib/dp/localRecords";
import { deleteAccountBlobs } from "@/lib/dp/blobs";
import { LEGACY_OWNER_KEY } from "@/lib/dp/accountScope";
import { flushLocalWrites, readDb } from "@/lib/dp/store";

export function AccountDeletion() {
  const { user } = useAccount();
  const [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [emailSent, setEmailSent] = useState(false);
  async function reauthenticate() {
    if (!user?.email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: { shouldCreateUser: false, emailRedirectTo: authRedirect("deletion") },
      });
      if (error) throw error;
      setEmailSent(true);
      setMessage(
        "Abra o link enviado ao seu e-mail e volte a esta tela. A conta não será excluída apenas por abrir o link.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível confirmar o acesso.");
    } finally {
      setBusy(false);
    }
  }
  async function removeAccount() {
    if (!user || confirmation !== "EXCLUIR" || readDb().activeTripId) return;
    if (
      !window.confirm(
        "Excluir definitivamente sua conta, viagens, abastecimentos, originais e cópias operacionais do CARVRUM? Exporte o que deseja preservar antes. Esta ação não pode ser desfeita.",
      )
    )
      return;
    setBusy(true);
    try {
      await flushLocalWrites();
      const records = readDb(),
        owner = localStorage.getItem(LEGACY_OWNER_KEY);
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { confirmation },
      });
      if (error) {
        const context = (error as { context?: Response }).context;
        const body = context ? await context.json().catch(() => null) : null;
        throw Error(body?.error ?? error.message);
      }
      if (data?.status !== "deleted") {
        setMessage(
          "Exclusão em processamento. Clique novamente para continuar. Alterações na nuvem ficam bloqueadas durante a exclusão.",
        );
        return;
      }
      await deleteAccountBlobs(
        user.id,
        owner === user.id ? records.evidences.map((e) => e.id) : [],
      );
      await deleteLocalScope(user.id);
      await deleteNativeExports(user.id);
      if (owner === user.id) {
        localStorage.removeItem("driveproof:v1");
        await deleteLocalScope("guest");
        await deleteAccountBlobs("guest");
        // Keep the binding tombstone: no surviving legacy copy may be reassigned.
      }
      for (const key of Object.keys(localStorage))
        if (
          key.endsWith(":" + user.id) ||
          key.startsWith("driveproof:conflict-review:" + user.id + ":")
        )
          localStorage.removeItem(key);
      await supabase.auth.signOut({ scope: "local" });
      setMessage(
        "Sua conta foi excluída. Nesta instalação, os dados locais dessa conta também foram removidos. Outros aparelhos devem se conectar para encerrar suas sessões e limpar as cópias locais.",
      );
      toast.success("Conta excluída.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-md border border-destructive/50 p-4">
      <h2 className="font-semibold">Excluir minha conta</h2>
      <p className="text-sm">
        Remove sua conta, registros na nuvem, fotos originais e cópias operacionais vinculadas a
        ela. O processamento exige confirmação da identidade por um login realizado nos últimos dez
        minutos. As rotinas de backup continuam com o mesmo agendamento.
      </p>
      {!user ? (
        <p>
          Entre na sua conta pela tela inicial para solicitar a exclusão. Nenhuma exclusão é
          realizada sem autenticação.
        </p>
      ) : (
        <>
          <Button variant="outline" disabled={busy} onClick={reauthenticate}>
            {emailSent ? "Reenviar confirmação de acesso" : "Confirmar identidade por e-mail"}
          </Button>
          {readDb().activeTripId && <p role="alert">Finalize a viagem antes de excluir a conta.</p>}
          <label className="block">
            Digite EXCLUIR para confirmar
            <input
              className="mt-1 block min-h-12 w-full rounded-md border bg-background p-3"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            variant="destructive"
            disabled={busy || confirmation !== "EXCLUIR" || !!readDb().activeTripId}
            onClick={removeAccount}
          >
            {busy ? "Processando exclusão…" : "Excluir definitivamente minha conta"}
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
