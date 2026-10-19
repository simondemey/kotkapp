-- Enkel lopers krijgen een nummer; wandelaars en supporters niet.
-- Voer uit in Supabase > SQL Editor (samen met de bijgewerkte bevestigingsmail.sql die erboven staat).

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

-- Stap 2: lopers opnieuw nummeren (1, 2, 3, …), wandelaars en supporters zonder nummer – zonder mails
alter table public.inschrijvingen disable trigger stuur_bevestigingsmail;
alter table public.inschrijvingen disable trigger deelnemer_nummers;

do $$
declare
  r      record;
  teller bigint := 0;
  nieuw  jsonb;
  e      jsonb;
begin
  for r in select user_id, deelnemers from public.inschrijvingen order by created_at loop
    nieuw := '[]';
    for e in select value from jsonb_array_elements(r.deelnemers) with ordinality order by ordinality loop
      if coalesce((e ->> 'loopt')::boolean, false) then
        teller := teller + 1;
        nieuw := nieuw || jsonb_build_array((e - 'nr') || jsonb_build_object('nr', teller));
      else
        nieuw := nieuw || jsonb_build_array(e - 'nr');
      end if;
    end loop;
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
select coalesce(e ->> 'nr', '–') as nr, e ->> 'naam' as naam,
       case when (e ->> 'loopt')::boolean then 'loopt' when (e ->> 'wandelt')::boolean then 'wandelt' else 'supporter' end as keuze,
       i.email
from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
order by (e ->> 'nr')::bigint nulls last;
