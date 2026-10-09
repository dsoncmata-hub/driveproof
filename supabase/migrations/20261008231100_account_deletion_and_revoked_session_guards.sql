-- A separate user-initiated erasure flow. No cron jobs or backup capture functions change.
create table carvrum_sync_private.deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now(),
 status text not null default 'processing' check(status='processing')
);
alter table carvrum_sync_private.deletion_requests enable row level security;
revoke all on carvrum_sync_private.deletion_requests from public,anon,authenticated;

create or replace function carvrum_sync_private.active_account()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid text := auth.jwt()->>'session_id'; owner_id uuid := auth.uid();
begin
 if owner_id is null or sid is null or sid !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
 return exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=owner_id and s.id=sid::uuid and (s.not_after is null or s.not_after>now())
 and (u.banned_until is null or u.banned_until<now()))
 and not exists(select 1 from carvrum_sync_private.deletion_requests where user_id=owner_id);
end $$;
revoke all on function carvrum_sync_private.active_account() from public,anon;
grant execute on function carvrum_sync_private.active_account() to authenticated;
create or replace function public.carvrum_account_available()
returns boolean language sql stable security invoker set search_path='' as $$ select carvrum_sync_private.active_account(); $$;
revoke all on function public.carvrum_account_available() from public,anon;
grant execute on function public.carvrum_account_available() to authenticated;

do $$ declare tab text; begin
 foreach tab in array array['profiles','vehicles','stations','trips','trip_points','fuelings','evidences','local_backups','cloud_sync_state'] loop
 execute format('create policy carvrum_valid_session on public.%I as restrictive for all to authenticated using ((select public.carvrum_account_available())) with check ((select public.carvrum_account_available()))',tab);
 end loop;
end $$;
create policy carvrum_storage_valid_session on storage.objects as restrictive for all to authenticated
using (bucket_id not in ('driveproof-evidence','carvrum-tracks') or (select public.carvrum_account_available()))
with check (bucket_id not in ('driveproof-evidence','carvrum-tracks') or (select public.carvrum_account_available()));

-- Also guard the privileged CAS helper, which deliberately bypasses table RLS.
do $$ declare definition text; begin
 select pg_get_functiondef('carvrum_sync_private.upload(bigint,jsonb)'::regprocedure) into definition;
 definition := replace(definition,'if owner_id is null then','if not carvrum_sync_private.active_account() then');
 execute definition;
end $$;

create or replace function carvrum_sync_private.request_deletion()
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; started timestamptz;
begin
 if owner_id is null then raise exception 'Not authenticated' using errcode='42501'; end if;
 if sid is null or sid !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Entre novamente antes de excluir a conta' using errcode='42501'; end if;
 select created_at into started from auth.sessions where id=sid::uuid and user_id=owner_id and (not_after is null or not_after>now());
 if started is null then raise exception 'Sessão revogada' using errcode='42501'; end if;
 if not exists(select 1 from carvrum_sync_private.deletion_requests where user_id=owner_id) and started<now()-interval '10 minutes' then
  raise exception 'Entre novamente antes de excluir a conta' using errcode='42501';
 end if;
 insert into carvrum_sync_private.deletion_requests(user_id) values(owner_id) on conflict(user_id) do nothing;
 return jsonb_build_object('status','processing');
end $$;
revoke all on function carvrum_sync_private.request_deletion() from public,anon;
grant execute on function carvrum_sync_private.request_deletion() to authenticated;
create or replace function public.carvrum_request_account_deletion()
returns jsonb language sql security invoker set search_path='' as $$ select carvrum_sync_private.request_deletion(); $$;
revoke all on function public.carvrum_request_account_deletion() from public,anon;
grant execute on function public.carvrum_request_account_deletion() to authenticated;

-- Admin-only bounded inventory. Deletes use the Storage API, never the storage.objects table.
create or replace function carvrum_sync_private.deletion_objects(target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
 if not exists(select 1 from carvrum_sync_private.deletion_requests where user_id=target) then raise exception 'No confirmed deletion request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)) from
 (select bucket_id,name from storage.objects where bucket_id in ('driveproof-evidence','carvrum-tracks')
 and ((storage.foldername(name))[1]=target::text or owner_id=target::text) order by bucket_id,name limit 500) q),'[]'::jsonb);
end $$;
create or replace function carvrum_sync_private.purge_requested_backups(target uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
 if not exists(select 1 from carvrum_sync_private.deletion_requests where user_id=target) then raise exception 'No confirmed deletion request'; end if;
 if exists(select 1 from storage.objects where bucket_id in ('driveproof-evidence','carvrum-tracks') and ((storage.foldername(name))[1]=target::text or owner_id=target::text)) then raise exception 'Remove originals first'; end if;
 -- Delete that person's operational copies only when their explicit request is processed.
 delete from driveproof_private.snapshots_12h where user_id=target;
 delete from public.local_backups where user_id=target;
 delete from public.cloud_sync_state where user_id=target;
end $$;
revoke all on function carvrum_sync_private.deletion_objects(uuid) from public,anon,authenticated;
revoke all on function carvrum_sync_private.purge_requested_backups(uuid) from public,anon,authenticated;
grant usage on schema carvrum_sync_private to service_role;
grant execute on function carvrum_sync_private.deletion_objects(uuid),carvrum_sync_private.purge_requested_backups(uuid) to service_role;
create or replace function public.carvrum_deletion_objects(target uuid)
returns jsonb language sql security invoker set search_path='' as $$ select carvrum_sync_private.deletion_objects(target); $$;
create or replace function public.carvrum_purge_requested_backups(target uuid)
returns void language sql security invoker set search_path='' as $$ select carvrum_sync_private.purge_requested_backups(target); $$;
revoke all on function public.carvrum_deletion_objects(uuid),public.carvrum_purge_requested_backups(uuid) from public,anon,authenticated;
grant execute on function public.carvrum_deletion_objects(uuid),public.carvrum_purge_requested_backups(uuid) to service_role;
