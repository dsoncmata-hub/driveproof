import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { isNative } from "./native";
import { supabase } from "./supabase";
const pendingKey = "carvrum:native-auth-pending";
export function authRedirect(purpose: "login" | "deletion" = "login") {
  if (!isNative()) return window.location.origin + (purpose === "deletion" ? "/excluir-conta" : "");
  const nonce = crypto.randomUUID();
  localStorage.setItem(pendingKey, JSON.stringify({ nonce, purpose, at: Date.now() }));
  return "carvrum://auth-callback?nonce=" + nonce;
}
export function validNativeCallback(
  url: string,
  pending: { nonce: string; at: number },
  now = Date.now(),
) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "carvrum:" &&
      parsed.hostname === "auth-callback" &&
      parsed.pathname === "" &&
      parsed.searchParams.get("nonce") === pending.nonce &&
      now - pending.at >= 0 &&
      now - pending.at < 10 * 60_000 &&
      !!parsed.searchParams.get("code")
    );
  } catch {
    return false;
  }
}
export async function handleNativeCallback(url: string) {
  const pending = JSON.parse(localStorage.getItem(pendingKey) ?? "null");
  if (!pending || !validNativeCallback(url, pending))
    throw Error("Retorno de autenticação inválido ou expirado. Entre novamente.");
  const { error } = await supabase.auth.exchangeCodeForSession(
    new URL(url).searchParams.get("code")!,
  );
  if (error) throw error;
  localStorage.removeItem(pendingKey);
  await Browser.close().catch(() => {});
  window.location.assign(pending.purpose === "deletion" ? "/excluir-conta" : "/");
}
export async function initializeNativeAuth(onError: (message: string) => void) {
  if (!isNative()) return () => {};
  const consume = (url: string) => {
    void handleNativeCallback(url).catch((e) => onError(e.message));
  };
  const listener = await App.addListener("appUrlOpen", (event) => consume(event.url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) consume(launch.url);
  return () => {
    void listener.remove();
  };
}
export async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authRedirect(), skipBrowserRedirect: isNative() },
  });
  if (error) throw error;
  if (isNative()) {
    if (!data.url) throw Error("Não foi possível iniciar o login.");
    await Browser.open({ url: data.url });
  }
}
