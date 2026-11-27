-- Story units: a text with exercises at three levels (easy, medium, hard), and a log of
-- every answer (right or wrong, and how long it took), so a student who answers the
-- simple ones quickly and correctly moves up a level.

alter table public.school_units add column kind text not null default 'basic' check (kind in ('basic', 'story'));
alter table public.school_units add column content jsonb;

create table public.unit_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  unit_id uuid not null references public.school_units(id) on delete cascade,
  level text not null check (level in ('easy', 'medium', 'hard')),
  exercise text not null,          -- the exercise's id inside the unit
  correct boolean not null,
  ms integer not null check (ms >= 0),
  created_at timestamptz not null default now()
);
create index unit_answers_user_idx on public.unit_answers (user_id, unit_id, level);
alter table public.unit_answers enable row level security;
create policy "own answers" on public.unit_answers for all to anon, authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));
grant select, insert on public.unit_answers to anon, authenticated;
grant usage on sequence public.unit_answers_id_seq to anon, authenticated;

-- The home now carries each unit's kind and content.
create or replace function public.my_home()
returns json language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  p public.school_people;
begin
  if me is null then return null; end if;
  select * into p from public.school_people where user_id = me;
  if p.id is null then return null; end if;
  return json_build_object(
    'name', p.display_name,
    'kind', p.kind,
    'admin', p.is_admin,
    'modules', coalesce((
      select json_agg(json_build_object('key', m.key, 'he', m.title_he, 'ru', m.title_ru, 'icon', m.icon) order by m.sort_order)
      from public.school_modules m
      where m.enabled and m.ready and (p.kind = 'teacher' or app_private.in_audience('module', m.key, p.id))
    ), '[]'::json),
    'units', coalesce((
      select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link, 'kind', u.kind, 'content', u.content)
        order by u.sort_order, u.title)
      from public.school_units u
      where u.published and (p.kind = 'teacher' or app_private.in_audience('unit', u.id::text, p.id))
    ), '[]'::json)
  );
end;
$$;
