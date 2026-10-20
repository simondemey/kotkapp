-- Elke deelnemer krijgt een vast, uniek nummer (1, 2, 3, …) bij het inschrijven.
-- Voer uit in Supabase > SQL Editor. Je kan het veilig opnieuw uitvoeren.
--
-- Werking:
--   * Het nummer staat als "nr" bij de deelnemer in inschrijvingen.deelnemers.
--   * Een trigger deelt nummers uit; bezoekers kunnen zelf geen nummer kiezen of vervalsen.
--   * Bij het aanpassen van een inschrijving houden bestaande deelnemers hun nummer;
--     nieuwe deelnemers krijgen het volgende vrije nummer. Verwijderde nummers worden niet hergebruikt.

create sequence if not exists public.deelnemer_nr;

create or replace function public.deelnemer_nummers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oud        jsonb;
  gebruikt   bigint[] := '{}';   -- posities van oude deelnemers die al gekoppeld zijn
  resultaat  jsonb    := '[]';
  e          jsonb;
  m          jsonb;
  mpos       bigint;
  loper      boolean;
  nr         bigint;
begin
  -- Upsert op een bestaande inschrijving: de UPDATE-trigger die hierna volgt doet het werk
  if tg_op = 'INSERT' and exists (select 1 from public.inschrijvingen where user_id = new.user_id) then
    return new;
  end if;

  select i.deelnemers into oud from public.inschrijvingen i where i.user_id = new.user_id;
  oud := coalesce(oud, '[]');

  for e in select value from jsonb_array_elements(new.deelnemers) with ordinality order by ordinality loop
    m := null; mpos := null;

    -- a. op id
    if jsonb_typeof(e -> 'id') = 'string' then
      select x.o, x.pos into m, mpos
        from jsonb_array_elements(oud) with ordinality as x(o, pos)
       where x.o ->> 'id' = e ->> 'id' and not x.pos = any (gebruikt)
       order by x.pos limit 1;
    end if;
    -- b. op naam
    if m is null then
      select x.o, x.pos into m, mpos
        from jsonb_array_elements(oud) with ordinality as x(o, pos)
       where lower(btrim(x.o ->> 'naam')) = lower(btrim(e ->> 'naam')) and not x.pos = any (gebruikt)
       order by x.pos limit 1;
    end if;

    loper := coalesce((e ->> 'loopt')::boolean, false);
    e := e - 'id' - 'nr';
    if m is not null then
      gebruikt := gebruikt || mpos;
    end if;
    e := e || jsonb_build_object('id', coalesce(m ->> 'id', gen_random_uuid()::text));

    if loper then
      if m is not null and jsonb_typeof(m -> 'nr') = 'number' and coalesce((m ->> 'loopt')::boolean, false) then
        nr := (m ->> 'nr')::bigint;
      else
        nr := nextval('public.deelnemer_nr');
      end if;
      e := e || jsonb_build_object('nr', nr);
    end if;

    resultaat := resultaat || jsonb_build_array(e);
  end loop;

  new.deelnemers := resultaat;
  return new;
end;
$$;

drop trigger if exists deelnemer_nummers on public.inschrijvingen;
create trigger deelnemer_nummers
  before insert or update on public.inschrijvingen
  for each row execute function public.deelnemer_nummers();

-- Bestaande inschrijvingen nummeren (oudste eerst), enkel deelnemers die nog geen nummer hebben
do $$
declare
  r record;
begin
  for r in select user_id from public.inschrijvingen order by created_at loop
    update public.inschrijvingen set deelnemers = deelnemers where user_id = r.user_id;
  end loop;
end;
$$;

-- Controle
select e ->> 'nr' as nr, e ->> 'naam' as naam, i.email
from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
order by (e ->> 'nr')::bigint;
