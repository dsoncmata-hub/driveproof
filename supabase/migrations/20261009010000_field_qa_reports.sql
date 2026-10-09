-- CARVRUM field QA reports are isolated from operational trips and backup schedules.
create table if not exists public.carvrum_qa_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  app_version text not null default '0.3.0',
  commit_sha text,
  device_platform text not null check (device_platform in ('android','ios','web')),
  device_model text not null default '',
  os_version text not null default '',
  tester_name text not null default '',
  test_date date not null default current_date,
  trip_label text not null default '',
  measures jsonb not null default '{}'::jsonb check (jsonb_typeof(measures) = 'object'),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  observations text not null default '',
  status text not null default 'draft' check (status in ('draft','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.carvrum_qa_reports enable row level security;
revoke all on public.carvrum_qa_reports from anon;
grant select,insert,update,delete on public.carvrum_qa_reports to authenticated;
create policy "qa_select_own" on public.carvrum_qa_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "qa_insert_own" on public.carvrum_qa_reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "qa_update_own" on public.carvrum_qa_reports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "qa_delete_own" on public.carvrum_qa_reports for delete to authenticated using (user_id = (select auth.uid()));
create index carvrum_qa_reports_user_date_idx on public.carvrum_qa_reports (user_id, created_at desc);
comment on table public.carvrum_qa_reports is 'Isolated field QA checklists; never part of customer trip telemetry or scheduled backups.';