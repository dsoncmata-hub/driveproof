import { createClient } from "@supabase/supabase-js";

// Project URL and publishable key are public client identifiers, not secrets.
// Authorization is enforced by database RLS policies.
export const supabase = createClient(
  "https://pylmernfpgcwxylzcbqi.supabase.co",
  "sb_publishable_TyFeAkl-bQCp159r_wSmyg_EGy2ykqO",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
