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
-- Eén inschrijving per account met 1 tot 10 deelnemers.
-- Elke deelnemer: {"naam": "...", "loopt": bool, "wandelt": bool, "supporter": bool}, precies één ervan true.
create or replace function public.deelnemers_geldig(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(d) = 'array'
     and jsonb_array_length(d) between 1 and 10
     and not exists (
       select 1 from jsonb_array_elements(d) e
       where jsonb_typeof(e -> 'naam') is distinct from 'string'
          or char_length(btrim(e ->> 'naam')) not between 1 and 100
          or jsonb_typeof(e -> 'loopt') is distinct from 'boolean'
          or jsonb_typeof(e -> 'wandelt') is distinct from 'boolean'
          or jsonb_typeof(e -> 'supporter') is distinct from 'boolean'
          or ((e ->> 'loopt')::boolean::int
              + (e ->> 'wandelt')::boolean::int
              + (e ->> 'supporter')::boolean::int) <> 1
     );
$$;

create table if not exists public.inschrijvingen (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email       text,
  deelnemers  jsonb not null check (public.deelnemers_geldig(deelnemers)),
  vragen      text check (char_length(vragen) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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


-- ---------- Vast nummer per deelnemer (zie ook nummers.sql) ----------
create sequence if not exists public.deelnemer_nr;

create or replace function public.deelnemer_nummers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oud      jsonb;
  oud_nrs  bigint[];
  gebruikt bigint[] := '{}';
  gekozen  int[]    := '{}';   -- posities die stap 1 hun eigen nummer laat houden
  resultaat jsonb   := '[]';
  e        jsonb;
  pos      int;
  nr       bigint;
begin
  -- Upsert op een bestaande inschrijving: de UPDATE-trigger die hierna volgt deelt de nummers uit
  if tg_op = 'INSERT' and exists (select 1 from public.inschrijvingen where user_id = new.user_id) then
    return new;
  end if;

  -- Deelnemers (met nummer) die deze gebruiker nu heeft
  select coalesce(jsonb_agg(x), '[]'), coalesce(array_agg((x ->> 'nr')::bigint), '{}')
    into oud, oud_nrs
    from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) x
   where i.user_id = new.user_id
     and jsonb_typeof(x -> 'nr') = 'number'
     and coalesce((x ->> 'loopt')::boolean, false);

  -- 1. meegestuurde, geldige nummers behouden (elk nummer maar één keer; enkel lopers)
  for e, pos in select value, ordinality from jsonb_array_elements(new.deelnemers) with ordinality loop
    if jsonb_typeof(e -> 'nr') = 'number' and coalesce((e ->> 'loopt')::boolean, false) then
      nr := (e ->> 'nr')::bigint;
      if nr = any (oud_nrs) and not nr = any (gebruikt) then
        gebruikt := gebruikt || nr;
        gekozen  := gekozen || pos;
      end if;
    end if;
  end loop;

  -- 2 en 3. de rest: nummer terugvinden op naam, anders een nieuw nummer
  for e, pos in select value, ordinality from jsonb_array_elements(new.deelnemers) with ordinality loop
    if pos = any (gekozen) then
      resultaat := resultaat || jsonb_build_array(e);
      continue;
    end if;

    -- Wandelaars en supporters krijgen geen nummer
    if not coalesce((e ->> 'loopt')::boolean, false) then
      resultaat := resultaat || jsonb_build_array(e - 'nr');
      continue;
    end if;

    nr := null;
    select (o ->> 'nr')::bigint into nr
      from jsonb_array_elements(oud) o
     where lower(btrim(o ->> 'naam')) = lower(btrim(e ->> 'naam'))
       and not (o ->> 'nr')::bigint = any (gebruikt)
     order by (o ->> 'nr')::bigint
     limit 1;

    if nr is null then
      nr := nextval('public.deelnemer_nr');
    end if;
    gebruikt  := gebruikt || nr;
    resultaat := resultaat || jsonb_build_array((e - 'nr') || jsonb_build_object('nr', nr));
  end loop;

  new.deelnemers := resultaat;
  return new;
end;
$$;

drop trigger if exists deelnemer_nummers on public.inschrijvingen;
create trigger deelnemer_nummers
  before insert or update on public.inschrijvingen
  for each row execute function public.deelnemer_nummers();

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
