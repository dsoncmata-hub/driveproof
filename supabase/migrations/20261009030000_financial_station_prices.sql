create table if not exists public.carvrum_financial_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 vehicle_label text not null default '',
 category text not null check (category in ('manutencao','seguro','imposto','estacionamento','pedagio','outro','receita')),
 description text not null default '',
 amount numeric(12,2) not null check(amount > 0 and amount <= 1000000),
 incurred_on date not null default current_date,
 created_at timestamptz not null default now()
);
alter table public.carvrum_financial_entries enable row level security;
revoke all on public.carvrum_financial_entries from anon;
grant select,insert,delete on public.carvrum_financial_entries to authenticated;
create policy carvrum_fin_select on public.carvrum_financial_entries for select to authenticated using (user_id=(select auth.uid()));
create policy carvrum_fin_insert on public.carvrum_financial_entries for insert to authenticated with check (user_id=(select auth.uid()));
create policy carvrum_fin_delete on public.carvrum_financial_entries for delete to authenticated using (user_id=(select auth.uid()));
create index carvrum_fin_user_date on public.carvrum_financial_entries(user_id,incurred_on desc);
create table if not exists public.carvrum_station_prices (
 id uuid primary key default gen_random_uuid(),
 station_name text not null,
 station_address text not null,
 municipality text not null,
 state_uf char(2) not null,
 latitude double precision not null check(latitude between -34 and 6),
 longitude double precision not null check(longitude between -75 and -30),
 fuel_type text not null check(fuel_type in ('gasolina','etanol','diesel','diesel_s10','gnv','gasolina_aditivada')),
 price_per_unit numeric(8,3) not null check(price_per_unit > 0 and price_per_unit < 100),
 observed_on date not null,
 source text not null default 'ANP' check(source='ANP'),
 imported_at timestamptz not null default now()
);
alter table public.carvrum_station_prices enable row level security;
revoke all on public.carvrum_station_prices from anon,authenticated;
grant select on public.carvrum_station_prices to anon,authenticated;
create policy carvrum_station_prices_public_read on public.carvrum_station_prices for select to anon,authenticated using(true);
create index carvrum_station_prices_geo on public.carvrum_station_prices(latitude,longitude,observed_on desc,fuel_type);
comment on table public.carvrum_station_prices is 'Admin-only ingestion of geocoded ANP station-level samples. Never infer live prices or geocode from an address without evidence. No client write access.';
