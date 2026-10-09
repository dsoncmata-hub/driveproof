import type { Session, User } from "@supabase/supabase-js";
export const AUTH_STORAGE_KEY = "sb-pylmernfpgcwxylzcbqi-auth-token";
const verifiedKey = "carvrum:last-verified-session";
function sessionId(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")))
      .session_id as string | undefined;
  } catch {
    return undefined;
  }
}
export function rememberVerifiedSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(verifiedKey);
    return;
  }
  const id = sessionId(session.access_token);
  if (id)
    localStorage.setItem(verifiedKey, JSON.stringify({ userId: session.user.id, sessionId: id }));
}
/** Previously verified device session only. Cloud access still verifies the live session. */
export function offlineAccount(): User | null {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null") as Session | null;
    const verified = JSON.parse(localStorage.getItem(verifiedKey) ?? "null");
    return session &&
      verified &&
      session.user.id === verified.userId &&
      sessionId(session.access_token) === verified.sessionId
      ? session.user
      : null;
  } catch {
    return null;
  }
}
