-- School sign-in: classes, students and teachers from the school system ("החדר").
-- A student picks their class, taps their name and types a personal code; a teacher
-- picks their name the same way. The first time, the person chooses their code, and
-- a regular user (the same kind as everyone else) is created for them.
--
-- The roster (first names and classes) is not public: reading it and signing in need
-- the school key, which each school device stores once. Names are never in this file
-- (the repository is public) — they are loaded separately from the school system.

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  name_he text not null unique,          -- "ב"
  name_ru text not null,                 -- "2"
  sort_order integer not null default 0
);

create table public.school_people (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('student', 'teacher')),
  external_id text not null unique,      -- the id in the school system; never the name
  class_id uuid references public.school_classes(id) on delete set null,
  display_name text not null,            -- first name (+ initial of the last name when two share it)
  active boolean not null default true,
  user_id uuid unique references public.users(id) on delete set null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index school_people_class_idx on public.school_people (class_id, display_name);

-- Only the functions below touch these tables.
alter table public.school_classes enable row level security;
alter table public.school_people enable row level security;
revoke all on public.school_classes, public.school_people from anon, authenticated;

-- The school key: stored as a hash, checked by every school function.
create or replace function app_private.school_key_ok(p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app_private.settings s
    where s.key = 'school_key_hash' and s.value = extensions.crypt(coalesce(p_key, ''), s.value)
  );
$$;

-- Classes and people for the sign-in screen. Only what the screen shows.
create or replace function public.school_roster(p_key text)
returns json language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.school_key_ok(p_key) then
    raise exception 'bad school key';
  end if;
  return json_build_object(
    'classes', coalesce((
      select json_agg(json_build_object('id', c.id, 'he', c.name_he, 'ru', c.name_ru) order by c.sort_order, c.name_he)
      from public.school_classes c
      where exists (select 1 from public.school_people p where p.class_id = c.id and p.active)
    ), '[]'::json),
    'people', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name,
        'has_code', p.user_id is not null
      ) order by p.display_name)
      from public.school_people p where p.active
    ), '[]'::json)
  );
end;
$$;

-- Sign in. Returns the user's id and name, or raises:
--   'bad school key' | 'no such person' | 'no code yet' | 'locked' | 'wrong code'
-- Five wrong codes in a row lock the person for 10 minutes (codes are short).
create or replace function public.school_login(p_key text, p_person uuid, p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people;
  u public.users;
begin
  if not app_private.school_key_ok(p_key) then raise exception 'bad school key'; end if;
  select * into p from public.school_people where id = p_person and active;
  if p.id is null then raise exception 'no such person'; end if;
  if p.user_id is null then raise exception 'no code yet'; end if;
  if p.locked_until is not null and p.locked_until > now() then raise exception 'locked'; end if;

  select * into u from public.users where id = p.user_id;
  if u.pin_hash is null or u.pin_hash <> extensions.crypt(coalesce(p_code, ''), u.pin_hash) then
    update public.school_people
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where id = p.id;
    raise exception 'wrong code';
  end if;

  update public.school_people set failed_attempts = 0, locked_until = null where id = p.id;
  return json_build_object('id', u.id, 'name', u.name);
end;
$$;

-- First sign-in: the person chooses a code and gets a user. Only while they have none.
create or replace function public.school_first_code(p_key text, p_person uuid, p_code text, p_language text default 'he')
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people;
  cls text;
  user_name text;
  new_id uuid;
begin
  if not app_private.school_key_ok(p_key) then raise exception 'bad school key'; end if;
  if coalesce(p_code, '') !~ '^[0-9]{4,8}$' then raise exception 'code must be 4-8 digits'; end if;
  select * into p from public.school_people where id = p_person and active for update;
  if p.id is null then raise exception 'no such person'; end if;
  if p.user_id is not null then raise exception 'already has a code'; end if;

  -- User names are unique; the class keeps two children with the same name apart.
  select c.name_he into cls from public.school_classes c where c.id = p.class_id;
  user_name := left(p.display_name || coalesce(' · ' || cls, ''), 40);
  while exists (select 1 from public.users where lower(name) = lower(user_name)) loop
    user_name := left(p.display_name, 34) || coalesce(' · ' || cls, '') || ' ' || substr(md5(random()::text), 1, 3);
  end loop;

  new_id := public.create_user(user_name, p_code, 'ashkenazi',
    case when p_language in ('he', 'ru', 'fa') then p_language else 'he' end);
  update public.school_people set user_id = new_id, failed_attempts = 0, locked_until = null where id = p.id;
  return json_build_object('id', new_id, 'name', user_name);
end;
$$;

revoke execute on function public.school_roster(text) from public;
revoke execute on function public.school_login(text, uuid, text) from public;
revoke execute on function public.school_first_code(text, uuid, text, text) from public;
grant execute on function public.school_roster(text) to anon, authenticated;
grant execute on function public.school_login(text, uuid, text) to anon, authenticated;
grant execute on function public.school_first_code(text, uuid, text, text) to anon, authenticated;
revoke execute on function app_private.school_key_ok(text) from public, anon, authenticated;
