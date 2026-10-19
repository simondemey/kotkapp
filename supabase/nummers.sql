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
     and jsonb_typeof(x -> 'nr') = 'number';

  -- 1. meegestuurde, geldige nummers behouden (elk nummer maar één keer)
  for e, pos in select value, ordinality from jsonb_array_elements(new.deelnemers) with ordinality loop
    if jsonb_typeof(e -> 'nr') = 'number' then
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
