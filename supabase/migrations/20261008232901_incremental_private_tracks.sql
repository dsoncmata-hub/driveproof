-- Append-only blocks; existing snapshots, evidence objects and cron remain unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('carvrum-tracks','carvrum-tracks',false,1000000,array['application/json'])
on conflict (id) do nothing;
drop policy if exists carvrum_tracks_read on storage.objects;
create policy carvrum_tracks_read on storage.objects for select to authenticated
using (bucket_id='carvrum-tracks' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists carvrum_tracks_insert on storage.objects;
create policy carvrum_tracks_insert on storage.objects for insert to authenticated
with check (bucket_id='carvrum-tracks' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No UPDATE: a published hash always identifies immutable bytes.

-- Old clients must refresh before replacing a snapshot that uses GPS blocks.
create or replace function public.cloud_sync_upload(expected_revision bigint, new_snapshot jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.cloud_sync_state where user_id=auth.uid() and snapshot->'syncProtocol'='2'::jsonb) then
  raise exception 'Atualize o CARVRUM para sincronizar este formato de trajeto';
 end if;
 return carvrum_sync_private.upload(expected_revision,new_snapshot);
end $$;
create or replace function public.cloud_sync_upload_v2(expected_revision bigint, new_snapshot jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
begin
 if new_snapshot->'syncProtocol' is distinct from '2'::jsonb then raise exception 'Invalid sync protocol'; end if;
 return carvrum_sync_private.upload(expected_revision,new_snapshot);
end $$;
revoke all on function public.cloud_sync_upload_v2(bigint,jsonb) from public,anon;
grant execute on function public.cloud_sync_upload_v2(bigint,jsonb) to authenticated;
