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
          or (e ? 'supporter' and jsonb_typeof(e -> 'supporter') is distinct from 'boolean')
          or not ((e ->> 'loopt')::boolean
                  or (e ->> 'wandelt')::boolean
                  or coalesce((e ->> 'supporter')::boolean, false))
     );
$$;
