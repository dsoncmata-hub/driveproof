import { Capacitor } from "@capacitor/core";
import { authRedirect, loginWithGoogle } from "@/lib/dp/nativeAuth";
import { useState } from "react";
import { useAccount } from "./AccountProvider";
import { toast } from "sonner";
import { supabase } from "@/lib/dp/supabase";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dp/primitives";
import { CloudBackup } from "@/components/dp/CloudBackup";
import { CloudAutoSync } from "@/components/dp/CloudAutoSync";
import { CloudRestore } from "@/components/dp/CloudRestore";
import { CloudEvidenceSync } from "@/components/dp/CloudEvidenceSync";
import { CloudReconcile } from "@/components/dp/CloudReconcile";
import { ConflictArchive } from "./ConflictArchive";
import { Link } from "@tanstack/react-router";

export function CloudAccount() {
  const { user, ready: loaded } = useAccount();
  const googleAvailable = Capacitor.getPlatform() !== "ios";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function sendLink() {
    const address = email.trim();
    if (!address.includes("@") || !address.split("@")[1]?.includes(".")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: authRedirect() },
      });
      if (error) throw error;
      toast.success("Verifique seu e-mail para acessar a conta CARVRUM.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível conectar com o Google.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) toast.error(error.message);
    else
      toast.success("Conta desconectada. Seus registros ficam protegidos no espaço desta conta.");
  }

  return (
    <Panel title="Minha conta CARVRUM">
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Verificando sua sessão…</p>
      ) : user ? (
        <div className="space-y-3">
          <p className="text-sm">
            Conectado como <strong>{user.email}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Sua conta está conectada. Os registros permanecem neste aparelho; abaixo você pode
            sincronizá-los, recuperar dados e gerenciar as fotos originais na nuvem.
          </p>
          <CloudBackup key={"CloudBackup:" + user.id} userId={user.id} />
          <CloudAutoSync key={"CloudAutoSync:" + user.id} userId={user.id} />
          <CloudRestore key={"CloudRestore:" + user.id} userId={user.id} />
          <CloudReconcile key={"CloudReconcile:" + user.id} userId={user.id} />
          <CloudEvidenceSync key={"CloudEvidenceSync:" + user.id} userId={user.id} />
          <ConflictArchive key={"ConflictArchive:" + user.id} userId={user.id} />
          <Link to="/excluir-conta" className="block text-sm underline">
            Gerenciar exclusão da minha conta
          </Link>
          <Button type="button" variant="secondary" disabled={busy} onClick={signOut}>
            Sair da conta
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {googleAvailable
              ? "Acesse com sua conta Google (Gmail) ou receba um link por e-mail."
              : "Receba um link por e-mail para acessar sua conta CARVRUM."}{" "}
            Seus registros locais não serão apagados nem enviados automaticamente.
          </p>
          {googleAvailable && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={signInWithGoogle}
                className="min-h-14 w-full"
              >
                Continuar com Google (Gmail)
              </Button>
              <p className="text-center text-xs text-muted-foreground">ou acesse por e-mail</p>
            </>
          )}
          <label className="block">
            <span className="label-tec">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="mt-1 min-h-12 w-full rounded-md border border-input bg-secondary/40 px-3 outline-none focus:border-ring"
            />
          </label>
          <Button type="button" disabled={busy} onClick={sendLink} className="min-h-12 w-full">
            {busy ? "Enviando…" : "Receber link de acesso"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
