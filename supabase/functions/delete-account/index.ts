import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { deletionHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const anon =
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const secret =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authenticated = (token: string) =>
  createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const assert = (error: { message: string } | null) => {
  if (error) throw Error(error.message);
};
Deno.serve(
  deletionHandler({
    verify: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    request: async (token) => {
      const { error } = await authenticated(token).rpc("carvrum_request_account_deletion");
      assert(error);
    },
    objects: async (target) => {
      const { data, error } = await admin.rpc("carvrum_deletion_objects", { target });
      assert(error);
      return data;
    },
    remove: async (bucket, names) => {
      const { error } = await admin.storage.from(bucket).remove(names);
      assert(error);
    },
    purge: async (target) => {
      const { error } = await admin.rpc("carvrum_purge_requested_backups", { target });
      assert(error);
    },
    revoke: async (token) => {
      const { error } = await admin.auth.admin.signOut(token, "global");
      assert(error);
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      assert(error);
    },
  }),
);
