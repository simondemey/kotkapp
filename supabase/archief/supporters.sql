-- NIET OPNIEUW UITVOEREN – al toegepast op de live database in oktober 2026.
-- Reden: achterhaald: de validatie van deelnemers zit nu in accounts.sql.
-- Dit bestand staat enkel nog in supabase/archief/ als geschiedenis. Zie supabase/README.md.
-- ============================================================================================

-- Deelnemers mogen ook als supporter komen (aanmoedigen, niet lopen of wandelen).
-- Voer uit in Supabase > SQL Editor. Bestaande inschrijvingen blijven geldig.
-- Elke deelnemer: {"naam": "...", "loopt": bool, "wandelt": bool, "supporter": bool (optioneel)}, minstens één ervan true.
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
