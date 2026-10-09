insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('carvrum-qa-evidence','carvrum-qa-evidence',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.carvrum_qa_attachments (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.carvrum_qa_reports(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 check_id text not null check(check_id ~ '^(0[1-9]|1[0-9]|20)$'),
 object_path text not null unique,
 original_filename text not null,
 mime_type text not null,
 bytes bigint not null check(bytes > 0 and bytes <= 20971520),
 created_at timestamptz not null default now(),
 constraint qa_attachment_path check (object_path like user_id::text || '/' || report_id::text || '/' || check_id || '/%')
);
alter table public.carvrum_qa_attachments enable row level security;
revoke all on public.carvrum_qa_attachments from anon;
grant select,insert,delete on public.carvrum_qa_attachments to authenticated;
create policy qa_attachment_select on public.carvrum_qa_attachments for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.carvrum_qa_reports r where r.id=report_id and r.user_id=(select auth.uid())));
create policy qa_attachment_insert on public.carvrum_qa_attachments for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.carvrum_qa_reports r where r.id=report_id and r.user_id=(select auth.uid())));
create policy qa_attachment_delete on public.carvrum_qa_attachments for delete to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.carvrum_qa_reports r where r.id=report_id and r.user_id=(select auth.uid())));
create index carvrum_qa_attachments_report_idx on public.carvrum_qa_attachments(report_id,check_id);
create policy qa_storage_read on storage.objects for select to authenticated
using (bucket_id='carvrum-qa-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text
and exists(select 1 from public.carvrum_qa_reports r where r.id::text=(storage.foldername(name))[2] and r.user_id=(select auth.uid())));
create policy qa_storage_upload on storage.objects for insert to authenticated
with check (bucket_id='carvrum-qa-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text
and exists(select 1 from public.carvrum_qa_reports r where r.id::text=(storage.foldername(name))[2] and r.user_id=(select auth.uid())));
create policy qa_storage_delete on storage.objects for delete to authenticated
using (bucket_id='carvrum-qa-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text
and exists(select 1 from public.carvrum_qa_reports r where r.id::text=(storage.foldername(name))[2] and r.user_id=(select auth.uid())));
