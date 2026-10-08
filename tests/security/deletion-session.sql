create or replace function pg_temp.carvrum_deletion_security_test() returns jsonb
language plpgsql security invoker as $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); result jsonb:='[]'; n integer;
 snapshot jsonb:='{"version":1,"syncProtocol":2,"trips":[],"fuelings":[],"evidences":[],"stations":[],"vehicle":{},"activeTripId":null}';
begin
 begin
  insert into auth.users(id) values(a),(b);
  insert into auth.sessions(id,user_id,created_at) values(sa,a,now()-interval '2 hours'),(sb,b,now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
  if not public.carvrum_account_available() then raise exception 'Valid session denied'; end if;
  if public.cloud_sync_upload_v2(0,snapshot) is distinct from 1 then raise exception 'V2 initialization failed'; end if;
  begin
   perform public.cloud_sync_upload(1,snapshot);
   raise exception 'Old client replaced V2';
  exception when raise_exception then if sqlerrm='Old client replaced V2' then raise; end if; end;
  result:=result||'"old_client_cannot_replace_block_snapshot"'::jsonb;
  begin
   perform public.carvrum_request_account_deletion();
   raise exception 'Old login allowed deletion';
  exception when insufficient_privilege then null; end;
  result:=result||'"deletion_requires_recent_login"'::jsonb;
  execute 'reset role';
  update auth.sessions set created_at=now() where id=sa;
  insert into driveproof_private.snapshots_12h(user_id,sync_snapshot) values(a,snapshot),(b,snapshot);
  execute 'set local role authenticated';
  perform public.carvrum_request_account_deletion();
  if public.carvrum_account_available() then raise exception 'Pending deletion still active'; end if;
  select count(*) into n from public.cloud_sync_state;
  if n<>0 then raise exception 'Pending account reads hot data'; end if;
  begin
   perform public.cloud_sync_upload_v2(1,snapshot);
   raise exception 'Pending account still writes';
  exception when insufficient_privilege then null; end;
  result:=result||'"pending_deletion_blocks_read_and_cas"'::jsonb;
  begin
   perform public.carvrum_purge_requested_backups(b);
   raise exception 'Ordinary account purged another account';
  exception when insufficient_privilege then null; end;
  result:=result||'"authenticated_cannot_call_admin_purge"'::jsonb;
  execute 'reset role'; execute 'set local role service_role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.carvrum_purge_requested_backups(a);
  execute 'reset role';
  select count(*) into n from driveproof_private.snapshots_12h where user_id=a;
  if n<>0 then raise exception 'Requested operational backups survived'; end if;
  select count(*) into n from driveproof_private.snapshots_12h where user_id=b;
  if n<>1 then raise exception 'Other owner backup modified'; end if;
  result:=result||'"purge_only_confirmed_owner_backups"'::jsonb;
  delete from auth.sessions where id=sb;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
  if public.carvrum_account_available() then raise exception 'Revoked session still active'; end if;
  begin
   perform public.cloud_sync_upload_v2(0,snapshot);
   raise exception 'Revoked JWT created data';
  exception when insufficient_privilege then null; end;
  result:=result||'"revoked_session_jwt_cannot_read_or_write"'::jsonb;
  execute 'reset role';
  raise exception 'fixture rollback' using errcode='P0002';
 exception when no_data_found then null;
 end;
 return jsonb_build_object('passed',result,'fixture_users_remaining',(select count(*) from auth.users where id in(a,b)));
end $$;
select pg_temp.carvrum_deletion_security_test();
