-- Bedrijfssponsors (sponsormuur, "Met dank aan"-strook en beamer) – Running for Pauline
-- Voer uit in Supabase > SQL Editor (na accounts.sql). Veilig om opnieuw uit te voeren.
--
-- Overzicht:
--   * Tabel partners: één rij per bedrijfssponsor met niveau, logo, tekstje en link.
--     (Los van de tabel sponsors: dat zijn de sponsors per deelnemer.)
--   * Iedereen ziet zichtbare sponsors; enkel beheerders (is_admin()) voegen toe, wijzigen en verwijderen.
--   * Publieke bucket "partners" voor de logo's (PNG, JPEG of WebP, max. 2 MB). Enkel beheerders schrijven.

-- ---------- Tabel ----------
create table if not exists public.partners (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  naam        text not null check (length(trim(naam)) between 1 and 100),
  niveau      text not null check (niveau in ('hoofd', 'goud', 'zilver', 'brons')),
  tekst       text check (length(tekst) <= 500),
  url         text check (url ~ '^https://[^\s]+$'),
  logo_pad    text not null,
  volgorde    integer not null default 0,
  zichtbaar   boolean not null default true
);

alter table public.partners enable row level security;

grant select on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;

drop policy if exists "iedereen ziet zichtbare partners" on public.partners;
create policy "iedereen ziet zichtbare partners"
  on public.partners for select
  to anon, authenticated
  using (zichtbaar or public.is_admin());

drop policy if exists "admins voegen partners toe" on public.partners;
create policy "admins voegen partners toe"
  on public.partners for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins wijzigen partners" on public.partners;
create policy "admins wijzigen partners"
  on public.partners for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins verwijderen partners" on public.partners;
create policy "admins verwijderen partners"
  on public.partners for delete
  to authenticated
  using (public.is_admin());

-- ---------- Opslag voor logo's ----------
-- Geen SVG: een SVG in een publieke bucket kan script bevatten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partners', 'partners', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins uploaden partnerlogo's" on storage.objects;
create policy "admins uploaden partnerlogo's"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'partners' and public.is_admin());

-- Verwijderen via de Storage-API vraagt lees- én verwijderrecht
drop policy if exists "admins lezen partnerlogo's" on storage.objects;
create policy "admins lezen partnerlogo's"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'partners' and public.is_admin());

drop policy if exists "admins verwijderen partnerlogo's" on storage.objects;
create policy "admins verwijderen partnerlogo's"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'partners' and public.is_admin());

notify pgrst, 'reload schema';
