import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/dp/supabase";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dp/primitives";

export function CloudAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error && error.name !== "AuthSessionMissingError") console.warn(error.message);
      setUser(data.user ?? null);
      setLoaded(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

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
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Verifique seu e-mail para acessar a conta DriveProof.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Conta desconectada. Seus dados locais permanecem neste aparelho.");
  }

  return (
    <Panel title="Minha conta DriveProof">
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Verificando sua sessão…</p>
      ) : user ? (
        <div className="space-y-3">
          <p className="text-sm">Conectado como <strong>{user.email}</strong></p>
          <p className="text-xs text-muted-foreground">
            A conta foi autenticada. A sincronização dos registros ainda não foi ativada;
            viagens e abastecimentos continuam salvos somente neste aparelho.
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={signOut}>
            Sair da conta
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Entre por e-mail para ativar sua identidade na nuvem. Seus registros locais
            não serão apagados nem enviados automaticamente.
          </p>
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
