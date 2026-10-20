-- Live teller voor de homepagina: aantal lopers, wandelaars en supporters (geen namen of e-mails).
-- Voer uit in Supabase > SQL Editor. Je kan het veilig opnieuw uitvoeren.
create or replace function public.tellers()
returns json
language sql
stable
security definer          -- telt alle inschrijvingen, maar geeft enkel aantallen terug
set search_path = ''
as $$
  select json_build_object(
    'lopers',     count(*) filter (where coalesce((e ->> 'loopt')::boolean, false)),
    'wandelaars', count(*) filter (where coalesce((e ->> 'wandelt')::boolean, false)),
    'supporters', count(*) filter (where coalesce((e ->> 'supporter')::boolean, false)),
    'totaal',     count(*)
  )
  from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e;
$$;

revoke all on function public.tellers() from public;
grant execute on function public.tellers() to anon, authenticated;
