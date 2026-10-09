create table if not exists public.carvrum_user_price_observations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 station_name text not null,
 station_address text not null,
 latitude double precision not null,
 longitude double precision not null,
 fuel_type text not null check(fuel_type in ('gasolina','etanol','diesel','gnv')),
 price_per_unit numeric(8,3) not null check(price_per_unit>0 and price_per_unit<100),
 observed_at timestamptz not null default now(),
 verification_status text not null default 'unverified' check(verification_status='unverified')
);
alter table public.carvrum_user_price_observations enable row level security;
revoke all on public.carvrum_user_price_observations from anon;
grant select,insert on public.carvrum_user_price_observations to authenticated;
create policy user_price_select on public.carvrum_user_price_observations for select to authenticated using(user_id=(select auth.uid()));
create policy user_price_insert on public.carvrum_user_price_observations for insert to authenticated with check(user_id=(select auth.uid()));
comment on table public.carvrum_user_price_observations is 'User-reported prices not independently verified; must not enter cheapest-station rankings without moderation and quality control.';
