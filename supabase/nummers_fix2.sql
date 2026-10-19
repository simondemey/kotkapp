-- Herstel 2: nummers bleven oplopen bij herhaald opslaan wanneer de pagina geen nummer meestuurde
-- (bv. een oude, onthouden versie van de pagina).
-- Nieuwe regel per deelnemer, in deze volgorde:
--   1. stuurt de pagina een geldig bestaand nummer mee  -> dat nummer behouden;
--   2. anders: een bestaande deelnemer met dezelfde naam -> diens nummer terug;
--   3. anders: het volgende vrije nummer.
--
-- Voer uit in Supabase > SQL Editor. Stap 2 nummert alles opnieuw 1, 2, 3, … zonder mails.

-- Stap 1: trigger
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

-- Stap 2: alle deelnemers opnieuw nummeren (1, 2, 3, …) zonder mails
alter table public.inschrijvingen disable trigger stuur_bevestigingsmail;
alter table public.inschrijvingen disable trigger deelnemer_nummers;

do $$
declare
  r      record;
  teller bigint := 0;
  nieuw  jsonb;
begin
  for r in select user_id, deelnemers from public.inschrijvingen order by created_at loop
    select jsonb_agg((e - 'nr') || jsonb_build_object('nr', teller + volgorde) order by volgorde)
      into nieuw
      from jsonb_array_elements(r.deelnemers) with ordinality as x(e, volgorde);
    teller := teller + jsonb_array_length(r.deelnemers);
    update public.inschrijvingen set deelnemers = nieuw where user_id = r.user_id;
  end loop;
  if teller > 0 then
    perform setval('public.deelnemer_nr', teller, true);
  else
    perform setval('public.deelnemer_nr', 1, false);
  end if;
end;
$$;

alter table public.inschrijvingen enable trigger deelnemer_nummers;
alter table public.inschrijvingen enable trigger stuur_bevestigingsmail;

-- Controle
select e ->> 'nr' as nr, e ->> 'naam' as naam, i.email
from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
order by (e ->> 'nr')::bigint;
