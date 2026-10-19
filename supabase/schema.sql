-- Fotomuur – Running for Pauline
-- Plak dit volledig in Supabase > SQL Editor en klik "Run". Je kan het veilig opnieuw uitvoeren.
--
-- Werking:
--   * Bezoekers (anon) mogen een post toevoegen; die staat meteen op de muur.
--   * Een post verbergen: Table Editor > posts > kolom "goedgekeurd" op false zetten
--     (of de rij verwijderen). Bezoekers zien enkel posts met goedgekeurd = true.

-- ---------- Tabel met posts ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  naam        text not null check (char_length(naam) between 1 and 60),
  bericht     text check (char_length(bericht) <= 500),
  foto_pad    text,                       -- pad in de opslag-bucket "fotomuur"
  goedgekeurd boolean not null default true,  -- false = verborgen
  constraint post_niet_leeg check (bericht is not null or foto_pad is not null)
);

-- Posts zijn standaard meteen zichtbaar (ook voor projecten aangemaakt met een oudere versie van dit script)
alter table public.posts alter column goedgekeurd set default true;

alter table public.posts enable row level security;

grant select, insert on public.posts to anon, authenticated;

drop policy if exists "bezoekers zien goedgekeurde posts" on public.posts;
create policy "bezoekers zien goedgekeurde posts"
  on public.posts for select
  to anon, authenticated
  using (goedgekeurd = true);

drop policy if exists "bezoekers mogen posten ter goedkeuring" on public.posts;
drop policy if exists "bezoekers mogen posten" on public.posts;
create policy "bezoekers mogen posten"
  on public.posts for insert
  to anon, authenticated
  with check (true);

drop view if exists public.te_keuren;

-- ---------- Opslag voor foto's ----------
-- Publieke bucket: foto's krijgen een willekeurige naam.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotomuur', 'fotomuur', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bezoekers mogen foto's uploaden" on storage.objects;
create policy "bezoekers mogen foto's uploaden"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'fotomuur');
