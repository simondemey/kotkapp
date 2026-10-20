-- Gegevens voor de beamer (rankings en totalen). Enkel voor beheerders, zodat namen en bedragen
-- niet publiek opvraagbaar zijn. Voer uit in Supabase > SQL Editor (na sponsors.sql). Veilig om opnieuw uit te voeren.
create or replace function public.beamer_data()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultaat json;
begin
  if not public.is_admin() then
    raise exception 'Enkel voor beheerders' using errcode = '42501';
  end if;

  with deeln as (
    select (e ->> 'id')::uuid as id, e ->> 'naam' as naam, (e ->> 'nr')::bigint as nr,
           coalesce((e ->> 'loopt')::boolean, false) as loopt,
           coalesce((e ->> 'wandelt')::boolean, false) as wandelt
      from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
     where e ? 'id'
  ),
  met as (
    select d.*, r.aantal as rondjes,
           coalesce((select sum(case when s.soort = 'vast' then s.bedrag
                                     when r.aantal is not null and d.loopt then s.bedrag * r.aantal
                                     else 0 end)
                       from public.sponsors s where s.deelnemer_id = d.id), 0) as opgehaald
      from deeln d
      left join public.rondjes r on r.deelnemer_id = d.id
  )
  select json_build_object(
    'totaal', json_build_object(
      'deelnemers', (select count(*) from met where loopt or wandelt),
      'lopers',     (select count(*) from met where loopt),
      'wandelaars', (select count(*) from met where wandelt),
      'rondjes',    (select coalesce(sum(rondjes), 0) from met where loopt),
      'km',         (select round(coalesce(sum(rondjes), 0) * 1.7) from met where loopt),
      'opgehaald',  (select coalesce(sum(opgehaald), 0) from met where rondjes is not null)
    ),
    'lopers', coalesce((select json_agg(x) from (
        select nr, naam, rondjes from met
         where loopt and rondjes is not null and rondjes > 0
         order by rondjes desc, nr limit 10) x), '[]'),
    'opgehaald', coalesce((select json_agg(x) from (
        select nr, naam, round(opgehaald, 2) as bedrag from met
         where rondjes is not null and opgehaald > 0
         order by opgehaald desc, naam limit 10) x), '[]')
  ) into resultaat;

  return resultaat;
end;
$$;

revoke all on function public.beamer_data() from public, anon;
grant execute on function public.beamer_data() to authenticated;

notify pgrst, 'reload schema';
