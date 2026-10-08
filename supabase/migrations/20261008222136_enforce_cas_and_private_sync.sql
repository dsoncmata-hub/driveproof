-- Preserve all existing snapshots, photographs and backup schedules.
create schema if not exists carvrum_sync_private;
revoke all on schema carvrum_sync_private from public, anon;
grant usage on schema carvrum_sync_private to authenticated;

create or replace function carvrum_sync_private.upload(expected_revision bigint, new_snapshot jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  next_revision bigint;
begin
  if owner_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if new_snapshot is null or jsonb_typeof(new_snapshot) <> 'object'
     or new_snapshot->'version' is distinct from '1'::jsonb
     or jsonb_typeof(new_snapshot->'trips') is distinct from 'array'
     or jsonb_typeof(new_snapshot->'fuelings') is distinct from 'array'
     or jsonb_typeof(new_snapshot->'evidences') is distinct from 'array'
     or jsonb_typeof(new_snapshot->'stations') is distinct from 'array'
     or jsonb_typeof(new_snapshot->'vehicle') is distinct from 'object'
     or new_snapshot->'activeTripId' is distinct from 'null'::jsonb
     or octet_length(new_snapshot::text) > 4000000 then
    raise exception 'Invalid or oversized snapshot';
  end if;
  if expected_revision = 0 then
    insert into public.cloud_sync_state(user_id, revision, snapshot)
    values (owner_id, 1, new_snapshot)
    on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.cloud_sync_state set snapshot = new_snapshot, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = expected_revision returning revision into next_revision;
  end if;
  return next_revision;
end $$;
revoke all on function carvrum_sync_private.upload(bigint, jsonb) from public, anon;
grant execute on function carvrum_sync_private.upload(bigint, jsonb) to authenticated;

-- The exposed RPC stays compatible with the existing deployed client.
create or replace function public.cloud_sync_upload(expected_revision bigint, new_snapshot jsonb)
returns bigint language sql security invoker set search_path = ''
as $$ select carvrum_sync_private.upload(expected_revision, new_snapshot); $$;
revoke all on function public.cloud_sync_upload(bigint, jsonb) from public, anon;
grant execute on function public.cloud_sync_upload(bigint, jsonb) to authenticated;

-- A client must not bypass the atomic revision check with direct table writes.
revoke insert, update, delete, truncate, references, trigger on public.cloud_sync_state from anon, authenticated;
grant select on public.cloud_sync_state to authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
-- Content-addressed originals are immutable through the client API.
drop policy if exists driveproof_evidence_update on storage.objects;
