-- The school sign-in, second version:
-- * The class list is open (no school key): this front door is only for our school.
-- * A teacher types their code on a device and "opens" it for the rest of the day;
--   on an open device a student just taps their name. No codes for children to remember.
-- * A student signed in this way gets a token that lasts until the device closes.
--   current_user_id() accepts such a token in place of the personal code.

-- 1. No school key ---------------------------------------------------------------------
drop function public.school_roster(text);
drop function public.school_login(text, uuid, text);
drop function public.school_first_code(text, uuid, text, text);
drop function app_private.school_key_ok(text);
delete from app_private.settings where key = 'school_key_hash';

-- Whether the person chose a code themselves (students entering through an open
-- device get a user without one).
alter table public.school_people add column own_code boolean not null default false;
update public.school_people set own_code = true where user_id is not null;

-- 2. Sessions ---------------------------------------------------------------------------
-- A device opened by a teacher. Only a hash of the token is kept.
create table app_private.school_devices (
  token_hash text primary key,
  teacher uuid not null references public.school_people(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
-- A student's sign-in through an open device.
create table app_private.user_tokens (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  device_hash text references app_private.school_devices(token_hash) on delete cascade,
  expires_at timestamptz not null
);
create index user_tokens_user_idx on app_private.user_tokens (user_id);

create or replace function app_private.sha(p text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex'); $$;

-- End of today, Moscow time.
create or replace function app_private.end_of_school_day()
returns timestamptz language sql stable set search_path = ''
as $$ select (date_trunc('day', now() at time zone 'Europe/Moscow') + interval '1 day') at time zone 'Europe/Moscow'; $$;

-- 3. Who is calling: personal code, or a valid token ---------------------------------------
create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  uid uuid;
  code text;
begin
  if headers is null then
    return null;
  end if;
  begin
    uid := (headers ->> 'x-user-id')::uuid;
    code := convert_from(decode(headers ->> 'x-user-code', 'base64'), 'UTF8');
  exception when others then
    return null;
  end;
  if uid is null or code is null then
    return null;
  end if;
  -- A token (long and random) is checked first: one fast lookup.
  if length(code) >= 32 and exists (
    select 1 from app_private.user_tokens t
    where t.token_hash = app_private.sha(code) and t.user_id = uid and t.expires_at > now()
  ) then
    return uid;
  end if;
  return (
    select u.id from public.users u
    where u.id = uid and u.pin_hash is not null and u.pin_hash = extensions.crypt(code, u.pin_hash)
  );
end;
$$;

-- 4. The front door ------------------------------------------------------------------------
-- Classes and people, and whether this device is open (and by whom, until when).
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
        'id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'has_code', p.own_code
      ) order by p.display_name)
      from public.school_people p where p.active
    ), '[]'::json),
    'open', case when dev.expires_at is null then null
                 else json_build_object('teacher', dev.teacher, 'until', dev.expires_at) end
  );
end;
$$;

-- Checks a person's code (with the lock after 5 wrong tries). Internal.
create or replace function app_private.school_check_code(p_person uuid, p_code text)
returns public.school_people language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people;
  u public.users;
begin
  select * into p from public.school_people where id = p_person and active;
  if p.id is null then raise exception 'no such person'; end if;
  if not p.own_code or p.user_id is null then raise exception 'no code yet'; end if;
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
  return p;
end;
$$;

-- Sign in with a personal code (teachers, and students who chose one).
create or replace function public.school_login(p_person uuid, p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people := app_private.school_check_code(p_person, p_code);
begin
  return json_build_object('id', p.user_id, 'name', (select name from public.users where id = p.user_id));
end;
$$;

-- A teacher's first sign-in: they choose their code. (Students get theirs later, if ever.)
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

-- The person's user, created when needed (with the given code, or a random one).
create or replace function app_private.school_user(p_person uuid, p_code text, p_language text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people;
  cls text;
  user_name text;
  new_id uuid;
begin
  select * into p from public.school_people where id = p_person;
  if p.user_id is not null then
    if p_code is not null then
      update public.users set pin_hash = extensions.crypt(p_code, extensions.gen_salt('bf')) where id = p.user_id;
    end if;
    return p.user_id;
  end if;
  select c.name_he into cls from public.school_classes c where c.id = p.class_id;
  user_name := left(p.display_name || coalesce(' · ' || cls, ''), 40);
  while exists (select 1 from public.users where lower(name) = lower(user_name)) loop
    user_name := left(p.display_name, 34) || coalesce(' · ' || cls, '') || ' ' || substr(md5(random()::text), 1, 3);
  end loop;
  new_id := public.create_user(
    user_name,
    coalesce(p_code, encode(extensions.gen_random_bytes(24), 'hex')),
    'ashkenazi',
    case when p_language in ('he', 'ru', 'fa') then p_language else 'he' end
  );
  update public.school_people set user_id = new_id where id = p.id;
  return new_id;
end;
$$;

-- A teacher opens this device until the end of the day. Returns the device token.
create or replace function public.school_open(p_person uuid, p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people := app_private.school_check_code(p_person, p_code);
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  until timestamptz := app_private.end_of_school_day();
begin
  if p.kind <> 'teacher' then raise exception 'teachers only'; end if;
  delete from app_private.school_devices where expires_at < now() - interval '7 days';
  delete from app_private.user_tokens where expires_at < now() - interval '7 days';
  insert into app_private.school_devices (token_hash, teacher, expires_at) values (app_private.sha(token), p.id, until);
  return json_build_object('token', token, 'teacher', p.display_name, 'until', until);
end;
$$;

-- Close the device now: students signed in through it are signed out too.
create or replace function public.school_close(p_device text)
returns void language sql security definer set search_path = ''
as $$
  update app_private.user_tokens set expires_at = now() where device_hash = app_private.sha(p_device);
  update app_private.school_devices set expires_at = now() where token_hash = app_private.sha(p_device);
$$;

-- On an open device a student taps their name and is in.
create or replace function public.school_enter(p_device text, p_person uuid, p_language text default 'he')
returns json language plpgsql security definer set search_path = ''
as $$
declare
  dev app_private.school_devices;
  p public.school_people;
  uid uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into dev from app_private.school_devices where token_hash = app_private.sha(p_device) and expires_at > now();
  if dev.token_hash is null then raise exception 'device closed'; end if;
  select * into p from public.school_people where id = p_person and active for update;
  if p.id is null then raise exception 'no such person'; end if;
  if p.kind <> 'student' then raise exception 'students only'; end if;
  uid := app_private.school_user(p.id, null, p_language);
  insert into app_private.user_tokens (token_hash, user_id, device_hash, expires_at)
  values (app_private.sha(token), uid, dev.token_hash, dev.expires_at);
  return json_build_object('id', uid, 'name', (select name from public.users where id = uid), 'token', token);
end;
$$;

revoke execute on all functions in schema app_private from public, anon, authenticated;
revoke execute on function public.school_roster(text) from public;
revoke execute on function public.school_login(uuid, text) from public;
revoke execute on function public.school_first_code(uuid, text, text) from public;
revoke execute on function public.school_open(uuid, text) from public;
revoke execute on function public.school_close(text) from public;
revoke execute on function public.school_enter(text, uuid, text) from public;
grant execute on function public.school_roster(text) to anon, authenticated;
grant execute on function public.school_login(uuid, text) to anon, authenticated;
grant execute on function public.school_first_code(uuid, text, text) to anon, authenticated;
grant execute on function public.school_open(uuid, text) to anon, authenticated;
grant execute on function public.school_close(text) to anon, authenticated;
grant execute on function public.school_enter(text, uuid, text) to anon, authenticated;
