import { Capacitor } from "@capacitor/core";
import { createClient } from "@supabase/supabase-js";

import { AUTH_STORAGE_KEY } from "./offlineAccount";

// Project URL and publishable key are public client identifiers, not secrets.
// Authorization is enforced by database RLS policies.
export const supabase = createClient(
  "https://pylmernfpgcwxylzcbqi.supabase.co",
  "sb_publishable_TyFeAkl-bQCp159r_wSmyg_EGy2ykqO",
  {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      flowType: Capacitor.isNativePlatform() ? "pkce" : "implicit",
    },
  },
);
