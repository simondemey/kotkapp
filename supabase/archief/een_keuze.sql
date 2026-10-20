-- NIET OPNIEUW UITVOEREN – al toegepast op de live database in oktober 2026.
-- Reden: herschrijft de keuze van bestaande deelnemers; de validatie zit nu in accounts.sql.
-- Dit bestand staat enkel nog in supabase/archief/ als geschiedenis. Zie supabase/README.md.
-- ============================================================================================

-- Elke deelnemer kiest precies één: loopt, wandelt of supporter.
-- Voer uit in Supabase > SQL Editor.
-- Stap 1 zet bestaande deelnemers met meerdere keuzes recht (voorrang: loopt > wandelt > supporter).
-- Stap 2 laat de database voortaan enkel nog precies één keuze toe.

-- Stap 1: bestaande inschrijvingen rechtzetten
update public.inschrijvingen i
set deelnemers = (
  select jsonb_agg(
           jsonb_build_object(
             'naam',      e -> 'naam',
             'loopt',     coalesce((e ->> 'loopt')::boolean, false),
             'wandelt',   not coalesce((e ->> 'loopt')::boolean, false)
                          and coalesce((e ->> 'wandelt')::boolean, false),
             'supporter', not coalesce((e ->> 'loopt')::boolean, false)
                          and not coalesce((e ->> 'wandelt')::boolean, false)
           )
           order by t.nr)
  from jsonb_array_elements(i.deelnemers) with ordinality as t(e, nr)
);

-- Stap 2: validatie – precies één keuze per deelnemer
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

-- Controle: alle deelnemers met hun keuze
select i.email, e ->> 'naam' as naam,
       case when (e ->> 'loopt')::boolean then 'loopt'
            when (e ->> 'wandelt')::boolean then 'wandelt'
            else 'supporter' end as keuze
from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e;
