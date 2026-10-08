import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/dp/supabase";
import { offlineAccount, rememberVerifiedSession } from "@/lib/dp/offlineAccount";
import { initializeNativeAuth } from "@/lib/dp/nativeAuth";
import { activateLocalAccount } from "@/lib/dp/store";

const AccountContext = createContext<{ user: User | null; ready: boolean }>({
  user: null,
  ready: false,
});
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({
    user: null,
    ready: false,
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true,
      sequence = 0;
    let pending = Promise.resolve(),
      currentId: string | null | undefined;
    function verifyAndOpen() {
      const token = ++sequence;
      setState((s) => ({ ...s, ready: false }));
      pending = pending
        .catch(() => {})
        .then(async () => {
          if (!navigator.onLine) {
            const user = offlineAccount();
            if (currentId !== (user?.id ?? null)) await activateLocalAccount(user?.id ?? null);
            if (!alive || token !== sequence) return;
            currentId = user?.id ?? null;
            setError(null);
            setState({ user, ready: true });
            return;
          }
          const { data, error: authError } = await supabase.auth.getUser();
          if (!alive || token !== sequence) return;
          if (authError && authError.name !== "AuthSessionMissingError")
            throw Error("Não foi possível confirmar a conta. Reconecte para abrir seus registros.");
          if (data.user) {
            const session = await supabase.auth.getSession();
            if (!alive || token !== sequence) return;
            if (session.data.session?.user.id === data.user.id)
              rememberVerifiedSession(session.data.session);
          } else rememberVerifiedSession(null);
          const next = data.user?.id ?? null;
          if (currentId !== next) await activateLocalAccount(next);
          if (!alive || token !== sequence) return;
          currentId = next;
          setError(null);
          setState({ user: data.user, ready: true });
        })
        .catch((e) => {
          if (alive && token === sequence)
            setError(e instanceof Error ? e.message : "Falha ao abrir registros.");
        });
    }
    let removeNative = () => {};
    void initializeNativeAuth((message) => toast.error(message))
      .then((remove) => {
        if (alive) removeNative = remove;
        else remove();
      })
      .catch((e) => {
        if (alive) toast.error(e.message);
      });
    verifyAndOpen();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Never await Supabase calls inside its auth callback (the auth lock is held).
      if (event === "SIGNED_OUT") {
        rememberVerifiedSession(null);
        ++sequence;
        currentId = undefined;
        setState({ user: null, ready: false });
        pending = pending
          .catch(() => {})
          .then(async () => {
            await activateLocalAccount(null);
            if (alive) {
              currentId = null;
              setError(null);
              setState({ user: null, ready: true });
            }
          })
          .catch((e) => {
            if (alive) setError(e.message);
          });
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") queueMicrotask(verifyAndOpen);
    });
    const failure = (event: Event) => toast.error((event as CustomEvent<string>).detail);
    window.addEventListener("carvrum:storage-error", failure);
    window.addEventListener("online", verifyAndOpen);
    return () => {
      alive = false;
      removeNative();
      data.subscription.unsubscribe();
      window.removeEventListener("carvrum:storage-error", failure);
      window.removeEventListener("online", verifyAndOpen);
    };
  }, []);
  return (
    <AccountContext.Provider value={state}>
      {state.ready ? (
        children
      ) : (
        <main className="mx-auto max-w-md space-y-4 p-6" aria-busy={!error}>
          <h1 className="text-2xl font-bold">CARVRUM</h1>
          <p role="status">{error ?? "Abrindo seus registros com segurança…"}</p>
          {error && (
            <button className="rounded-md border p-3" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          )}
        </main>
      )}
    </AccountContext.Provider>
  );
}
