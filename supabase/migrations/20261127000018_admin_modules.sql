-- What students see after signing in, chosen in an admin panel.
-- * Modules (reading games, personal notes, learning units, summaries from other
--   systems…) are switched on and given an audience: everyone, some classes, or
--   particular students.
-- * Learning units are written by admins and get their own audience.
-- * Admins: the principal, and teachers he marks. They sign in with their teacher code;
--   the panel then works with a session token (12 hours).

alter table public.school_people add column is_admin boolean not null default false;

-- 1. Modules --------------------------------------------------------------------------
create table public.school_modules (
  key text primary key,
  title_he text not null,
  title_ru text not null,
  icon text not null,
  sort_order integer not null default 0,
  enabled boolean not null default false,
  ready boolean not null default true     -- false: shown in the panel as "coming soon"
);
insert into public.school_modules (key, title_he, title_ru, icon, sort_order, enabled, ready) values
  ('reading',   'קוראים בניקוד',              'Читаем с огласовками',        '📖', 1, true,  true),
  ('units',     'יחידות לימוד',               'Учебные блоки',               '🧩', 2, false, true),
  ('notes',     'הפתקים שלי',                 'Мои заметки',                 '📝', 3, false, true),
  ('mishnayot', 'מבחני משניות וגמרא',         'Экзамены по Мишне и Гмаре',   '📜', 4, false, false),
  ('tanya',     'תניא בעל פה',                'Танья наизусть',              '🕯️', 5, false, false),
  ('games',     'משחקים',                      'Игры',                        '🎮', 6, false, false);

-- Who sees a module or a unit. No rows = nobody.
create table public.school_audience (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('module', 'unit')),
  item_key text not null,
  target_kind text not null check (target_kind in ('all', 'class', 'student')),
  target_id uuid
);
create index school_audience_item_idx on public.school_audience (item_kind, item_key);
insert into public.school_audience (item_kind, item_key, target_kind) values ('module', 'reading', 'all');

-- 2. Learning units ----------------------------------------------------------------------
create table public.school_units (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  link text,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_by uuid references public.school_people(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 3. Personal notes (each user their own) ---------------------------------------------------
create table public.student_notes (
  user_id uuid primary key references public.users(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.student_notes enable row level security;
create policy "own notes" on public.student_notes for all to anon, authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));
grant select, insert, update on public.student_notes to anon, authenticated;

alter table public.school_modules enable row level security;
alter table public.school_audience enable row level security;
alter table public.school_units enable row level security;
revoke all on public.school_modules, public.school_audience, public.school_units from anon, authenticated;

-- 4. Who may see what ------------------------------------------------------------------------
create or replace function app_private.in_audience(p_kind text, p_key text, p_person uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.school_audience a
    left join public.school_people p on p.id = p_person
    where a.item_kind = p_kind and a.item_key = p_key
      and (a.target_kind = 'all'
        or (a.target_kind = 'class' and a.target_id = p.class_id)
        or (a.target_kind = 'student' and a.target_id = p_person))
  );
$$;

-- The signed-in user's home: their modules and units. Users who are not from the school
-- (they sign in the other way) get null, and keep the reading app as their home.
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
      select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link) order by u.sort_order, u.title)
      from public.school_units u
      where u.published and (p.kind = 'teacher' or app_private.in_audience('unit', u.id::text, p.id))
    ), '[]'::json)
  );
end;
$$;

-- 5. Admin sessions ----------------------------------------------------------------------------
create table app_private.admin_sessions (
  token_hash text primary key,
  person uuid not null references public.school_people(id) on delete cascade,
  expires_at timestamptz not null
);

create or replace function public.admin_login(p_person uuid, p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people := app_private.school_check_code(p_person, p_code);
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not p.is_admin then raise exception 'not an admin'; end if;
  delete from app_private.admin_sessions where expires_at < now();
  insert into app_private.admin_sessions values (app_private.sha(token), p.id, now() + interval '12 hours');
  return json_build_object('token', token, 'name', p.display_name);
end;
$$;

create or replace function app_private.admin_person(p_token text)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare
  who uuid;
begin
  select s.person into who from app_private.admin_sessions s
  join public.school_people p on p.id = s.person and p.is_admin and p.active
  where s.token_hash = app_private.sha(p_token) and s.expires_at > now();
  if who is null then raise exception 'admin session expired'; end if;
  return who;
end;
$$;

-- Everything the panel shows, in one call.
create or replace function public.admin_state(p_token text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare
  who uuid := app_private.admin_person(p_token);
begin
  return json_build_object(
    'me', who,
    'modules', (select json_agg(row_to_json(m) order by m.sort_order) from public.school_modules m),
    'audience', coalesce((select json_agg(json_build_object('kind', a.item_kind, 'key', a.item_key, 'target', a.target_kind, 'id', a.target_id)) from public.school_audience a), '[]'::json),
    'units', coalesce((select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link, 'published', u.published, 'sort_order', u.sort_order) order by u.sort_order, u.title) from public.school_units u), '[]'::json),
    'classes', (select json_agg(json_build_object('id', c.id, 'he', c.name_he) order by c.sort_order) from public.school_classes c),
    'people', (select json_agg(json_build_object('id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'admin', p.is_admin, 'has_code', p.own_code) order by p.display_name) from public.school_people p where p.active)
  );
end;
$$;

create or replace function public.admin_set_module(p_token text, p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  update public.school_modules set enabled = p_enabled where key = p_key;
end;
$$;

-- Replace the audience of a module or unit. p_targets: [{"target":"all"} | {"target":"class","id":…} | {"target":"student","id":…}]
create or replace function public.admin_set_audience(p_token text, p_kind text, p_key text, p_targets json)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  delete from public.school_audience where item_kind = p_kind and item_key = p_key;
  insert into public.school_audience (item_kind, item_key, target_kind, target_id)
  select p_kind, p_key, t->>'target', nullif(t->>'id', '')::uuid from json_array_elements(coalesce(p_targets, '[]'::json)) t;
end;
$$;

create or replace function public.admin_save_unit(p_token text, p_unit json)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := app_private.admin_person(p_token);
  uid uuid := nullif(p_unit->>'id', '')::uuid;
begin
  if coalesce(btrim(p_unit->>'title'), '') = '' then raise exception 'title required'; end if;
  if uid is null then
    insert into public.school_units (title, body, link, published, sort_order, created_by)
    values (btrim(p_unit->>'title'), coalesce(p_unit->>'body', ''), nullif(btrim(p_unit->>'link'), ''),
            coalesce((p_unit->>'published')::boolean, false), coalesce((p_unit->>'sort_order')::int, 0), who)
    returning id into uid;
  else
    update public.school_units set
      title = btrim(p_unit->>'title'), body = coalesce(p_unit->>'body', ''), link = nullif(btrim(p_unit->>'link'), ''),
      published = coalesce((p_unit->>'published')::boolean, false), sort_order = coalesce((p_unit->>'sort_order')::int, 0),
      updated_at = now()
    where id = uid;
  end if;
  return uid;
end;
$$;

create or replace function public.admin_delete_unit(p_token text, p_unit uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  delete from public.school_audience where item_kind = 'unit' and item_key = p_unit::text;
  delete from public.school_units where id = p_unit;
end;
$$;

-- Mark teachers as admins (not yourself, so the last admin can't lock everyone out).
create or replace function public.admin_set_admin(p_token text, p_person uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := app_private.admin_person(p_token);
begin
  if p_person = who then raise exception 'not yourself'; end if;
  update public.school_people set is_admin = p_admin where id = p_person and kind = 'teacher';
end;
$$;

-- A teacher forgot their code: let them choose a new one at the next sign-in.
create or replace function public.admin_reset_code(p_token text, p_person uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  update public.school_people set own_code = false, failed_attempts = 0, locked_until = null where id = p_person;
end;
$$;

-- The roster tells the sign-in screen which teachers are admins (to offer the panel).
create or replace function public.school_roster(p_device text default null)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare
  dev record;
begin
  select d.expires_at, p.display_name as teacher into dev
  from app_private.school_devices d join public.school_people p on p.id = d.teacher
  where d.token_hash = app_private.sha(p_device) and d.expires_at > now();

  return json_build_object(
    'classes', coalesce((
      select json_agg(json_build_object('id', c.id, 'he', c.name_he, 'ru', c.name_ru) order by c.sort_order, c.name_he)
      from public.school_classes c
      where exists (select 1 from public.school_people p where p.class_id = c.id and p.active)
    ), '[]'::json),
    'people', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'has_code', p.own_code, 'admin', p.is_admin
      ) order by p.display_name)
      from public.school_people p where p.active
    ), '[]'::json),
    'open', case when dev.expires_at is null then null
                 else json_build_object('teacher', dev.teacher, 'until', dev.expires_at) end
  );
end;
$$;

-- first_code after a reset: the person already has a user, so school_user only sets the new code.
create or replace function public.school_first_code(p_person uuid, p_code text, p_language text default 'he')
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people;
  new_id uuid;
begin
  if coalesce(p_code, '') !~ '^[0-9]{4,8}$' then raise exception 'code must be 4-8 digits'; end if;
  select * into p from public.school_people where id = p_person and active for update;
  if p.id is null then raise exception 'no such person'; end if;
  if p.kind <> 'teacher' then raise exception 'ask the teacher'; end if;
  if p.own_code then raise exception 'already has a code'; end if;
  new_id := app_private.school_user(p.id, p_code, p_language);
  update public.school_people set own_code = true, failed_attempts = 0, locked_until = null where id = p.id;
  return json_build_object('id', new_id, 'name', (select name from public.users where id = new_id));
end;
$$;

revoke execute on all functions in schema app_private from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_home()', 'public.admin_login(uuid, text)', 'public.admin_state(text)',
    'public.admin_set_module(text, text, boolean)', 'public.admin_set_audience(text, text, text, json)',
    'public.admin_save_unit(text, json)', 'public.admin_delete_unit(text, uuid)',
    'public.admin_set_admin(text, uuid, boolean)', 'public.admin_reset_code(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
