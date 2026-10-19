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
security definer          -- mag de teller gebruiken zonder extra rechten voor bezoekers
set search_path = ''
as $$
declare
  oude_nrs bigint[] := '{}';
begin
  -- Nummers die deze inschrijving al had, mogen blijven
  if tg_op = 'UPDATE' then
    select coalesce(array_agg((e ->> 'nr')::bigint), '{}')
      into oude_nrs
      from jsonb_array_elements(old.deelnemers) e
     where jsonb_typeof(e -> 'nr') = 'number';
  end if;

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
             -- hetzelfde nummer maar één keer in deze inschrijving
             and row_number() over (partition by e ->> 'nr' order by volgorde) = 1 as nr_ok
        from jsonb_array_elements(new.deelnemers) with ordinality as x(e, volgorde)
    ) t;

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
