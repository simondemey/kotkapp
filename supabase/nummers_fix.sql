-- Herstel: nummers bleven veranderen bij elke "Inschrijving opslaan".
-- Oorzaak: de site bewaart met een upsert (INSERT … ON CONFLICT DO UPDATE). Daarbij loopt eerst
-- de INSERT-trigger, die geen "oude" nummers kende en dus altijd nieuwe uitdeelde.
-- Oplossing: de trigger haalt de bestaande nummers altijd uit de opgeslagen inschrijving zelf.
--
-- Voer uit in Supabase > SQL Editor. Stap 2 nummert alle deelnemers opnieuw 1, 2, 3, …
-- (oudste inschrijving eerst) ZONDER bevestigingsmails te versturen.

-- Stap 1: trigger herstellen
create or replace function public.deelnemer_nummers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oude_nrs bigint[] := '{}';
begin
  -- Upsert op een bestaande inschrijving: de UPDATE-trigger die hierna volgt deelt de nummers uit
  -- (anders zou elk nieuw nummer twee keer getrokken worden en ontstaan er gaten).
  if tg_op = 'INSERT' and exists (select 1 from public.inschrijvingen where user_id = new.user_id) then
    return new;
  end if;

  -- Nummers die deze gebruiker al had
  select coalesce(array_agg((e ->> 'nr')::bigint), '{}')
    into oude_nrs
    from public.inschrijvingen i,
         jsonb_array_elements(i.deelnemers) e
   where i.user_id = new.user_id
     and jsonb_typeof(e -> 'nr') = 'number';

  select jsonb_agg(
           case
             when t.nr_ok then t.e
             else (t.e - 'nr') || jsonb_build_object('nr', nextval('public.deelnemer_nr'))
           end
           order by t.volgorde)
    into new.deelnemers
    from (
      select e, volgorde,
             jsonb_typeof(e -> 'nr') = 'number'
             and (e ->> 'nr')::bigint = any (oude_nrs)
             and row_number() over (partition by e ->> 'nr' order by volgorde) = 1 as nr_ok
        from jsonb_array_elements(new.deelnemers) with ordinality as x(e, volgorde)
    ) t;

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
  -- Volgende nieuwe deelnemer krijgt teller + 1
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
