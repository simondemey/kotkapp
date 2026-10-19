-- Accounts, inschrijvingen en beheerders – Running for Pauline
-- Voer uit NA schema.sql: plak dit volledig in Supabase > SQL Editor en klik "Run".
-- Je kan het veilig opnieuw uitvoeren.
--
-- Werking:
--   * Bezoekers loggen in met een inloglink per e-mail (Supabase Auth).
--   * Elke gebruiker heeft maximaal één inschrijving en ziet/bewerkt enkel de eigen inschrijving.
--   * Beheerders (tabel admins) zien alle inschrijvingen en mogen posts en foto's verwijderen.
--
-- Iemand beheerder maken (na de eerste keer inloggen):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'naam@voorbeeld.be'
--   on conflict do nothing;

-- ---------- Beheerders ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- RLS aan zonder policies: niemand kan deze tabel via de website lezen of wijzigen.
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Inschrijvingen ----------
create table if not exists public.inschrijvingen (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email        text,
  voornaam     text not null check (char_length(voornaam) between 1 and 60),
  achternaam   text not null check (char_length(achternaam) between 1 and 60),
  telefoon     text check (char_length(telefoon) <= 30),
  deelname     text not null check (deelname in ('lopen', 'wandelen')),
  rondjes_doel integer check (rondjes_doel between 0 and 100),
  opmerking    text check (char_length(opmerking) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- E-mail altijd uit het account halen en wijzigdatum bijhouden
create or replace function public.inschrijving_bijwerken()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := coalesce(auth.jwt() ->> 'email', new.email);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inschrijving_bijwerken on public.inschrijvingen;
create trigger inschrijving_bijwerken
  before insert or update on public.inschrijvingen
  for each row execute function public.inschrijving_bijwerken();

alter table public.inschrijvingen enable row level security;

revoke all on public.inschrijvingen from anon;
grant select, insert, update, delete on public.inschrijvingen to authenticated;

drop policy if exists "eigen inschrijving of admin lezen" on public.inschrijvingen;
create policy "eigen inschrijving of admin lezen"
  on public.inschrijvingen for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "eigen inschrijving toevoegen" on public.inschrijvingen;
create policy "eigen inschrijving toevoegen"
  on public.inschrijvingen for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "eigen inschrijving aanpassen" on public.inschrijvingen;
create policy "eigen inschrijving aanpassen"
  on public.inschrijvingen for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen inschrijving of admin verwijderen" on public.inschrijvingen;
create policy "eigen inschrijving of admin verwijderen"
  on public.inschrijvingen for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- Fotomuur: beheerders mogen posts verbergen en verwijderen ----------
grant update, delete on public.posts to authenticated;

drop policy if exists "admins beheren posts (wijzigen)" on public.posts;
create policy "admins beheren posts (wijzigen)"
  on public.posts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins beheren posts (verwijderen)" on public.posts;
create policy "admins beheren posts (verwijderen)"
  on public.posts for delete
  to authenticated
  using (public.is_admin());

-- Foto's verwijderen via de Storage-API vraagt lees- én verwijderrecht
drop policy if exists "admins lezen fotomuur-bestanden" on storage.objects;
create policy "admins lezen fotomuur-bestanden"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'fotomuur' and public.is_admin());

drop policy if exists "admins verwijderen fotomuur-bestanden" on storage.objects;
create policy "admins verwijderen fotomuur-bestanden"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fotomuur' and public.is_admin());
