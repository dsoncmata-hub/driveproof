-- Run with the Supabase SQL executor (administrative connection).
-- All fixture users and writes are rolled back inside the exception subtransaction.
create or replace function pg_temp.carvrum_security_test() returns jsonb
language plpgsql security invoker as $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  snapshot jsonb := '{"version":1,"trips":[],"fuelings":[],"evidences":[],"stations":[],"vehicle":{},"activeTripId":null}'::jsonb;
  result jsonb := '[]'::jsonb;
  revision bigint;
  visible_count bigint;
begin
  begin
    insert into auth.users(id) values(a), (b);
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text, true);
    revision := public.cloud_sync_upload(0, snapshot);
    if revision is distinct from 1 then raise exception 'First CAS insert failed'; end if;
    result := result || '"owner_initial_upload"'::jsonb;
    if public.cloud_sync_upload(0, snapshot) is not null then raise exception 'Duplicate initial upload bypassed CAS'; end if;
    result := result || '"duplicate_initial_upload_rejected"'::jsonb;
    revision := public.cloud_sync_upload(1, snapshot);
    if revision is distinct from 2 then raise exception 'CAS update failed'; end if;
    if public.cloud_sync_upload(1, snapshot) is not null then raise exception 'Stale revision accepted'; end if;
    result := result || '"stale_revision_rejected"'::jsonb;
    begin
      update public.cloud_sync_state set revision = 99 where user_id=a;
      raise exception 'Direct write was allowed';
    exception when insufficient_privilege then result := result || '"direct_write_denied"'::jsonb;
    end;
    begin
      perform public.cloud_sync_upload(2, '{"version":1}'::jsonb);
      raise exception 'Malformed snapshot was allowed';
    exception when raise_exception then
      if sqlerrm = 'Malformed snapshot was allowed' then raise; end if;
      result := result || '"malformed_snapshot_rejected"'::jsonb;
    end;
    perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text, true);
    select count(*) into visible_count from public.cloud_sync_state;
    if visible_count <> 0 then raise exception 'Cross-account snapshot leakage'; end if;
    result := result || '"second_account_cannot_read_first"'::jsonb;
    if public.cloud_sync_upload(2, snapshot) is not null then raise exception 'Second account modified first snapshot'; end if;
    result := result || '"second_account_cannot_update_first"'::jsonb;
    select count(*) into visible_count from storage.objects where bucket_id='driveproof-evidence';
    if visible_count <> 0 then raise exception 'Private photo metadata leaked'; end if;
    result := result || '"private_storage_isolation"'::jsonb;
    if public.cloud_sync_upload(0, snapshot) is distinct from 1 then raise exception 'Second owner insert failed'; end if;
    select count(*) into visible_count from public.cloud_sync_state;
    if visible_count <> 1 then raise exception 'Second account sees non-owned records'; end if;
    result := result || '"second_account_owns_separate_snapshot"'::jsonb;
    execute 'reset role';
    execute 'set local role anon';
    begin
      perform public.cloud_sync_upload(0, snapshot);
      raise exception 'Anonymous upload was allowed';
    exception when insufficient_privilege then result := result || '"anonymous_upload_denied"'::jsonb;
    end;
    execute 'reset role';
    -- Trigger rollback of the entire fixture subtransaction while retaining PL/pgSQL result variables.
    raise exception 'fixture rollback' using errcode='P0002';
  exception when no_data_found then null;
  end;
  return jsonb_build_object('passed',result,'fixture_users_remaining',(select count(*) from auth.users where id in(a,b)));
end $$;
select pg_temp.carvrum_security_test();
