-- The test student is for teachers and admins only: it is no longer on the class lists.
-- A teacher signs in with their code and chooses "enter as the test student".
-- One test student for the whole school.

update public.school_people set active = false where is_test;
insert into public.school_people (kind, external_id, class_id, display_name, is_test)
values ('student', 'test:all', null, '🧪 תלמיד בדיקה', true)
on conflict (external_id) do update set active = true;

-- Off the class lists.
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
      where exists (select 1 from public.school_people p where p.class_id = c.id and p.active and not p.is_test)
    ), '[]'::json),
    'people', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'has_code', p.own_code, 'admin', p.is_admin
      ) order by p.display_name)
      from public.school_people p where p.active and not p.is_test
    ), '[]'::json),
    'open', case when dev.expires_at is null then null
                 else json_build_object('teacher', dev.teacher, 'until', dev.expires_at) end
  );
end;
$$;

-- An open device lets real students in, never the test student.
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
  select * into p from public.school_people where id = p_person and active and not is_test for update;
  if p.id is null then raise exception 'no such person'; end if;
  if p.kind <> 'student' then raise exception 'students only'; end if;
  uid := app_private.school_user(p.id, null, p_language);
  insert into app_private.user_tokens (token_hash, user_id, device_hash, expires_at)
  values (app_private.sha(token), uid, dev.token_hash, dev.expires_at);
  return json_build_object('id', uid, 'name', (select name from public.users where id = uid), 'token', token);
end;
$$;

-- A teacher (with their code) enters as the test student until the end of the day.
create or replace function public.school_test_enter(p_person uuid, p_code text, p_language text default 'he')
returns json language plpgsql security definer set search_path = ''
as $$
declare
  t public.school_people := app_private.school_check_code(p_person, p_code);
  test uuid;
  uid uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if t.kind <> 'teacher' then raise exception 'teachers only'; end if;
  select id into test from public.school_people where external_id = 'test:all';
  uid := app_private.school_user(test, null, p_language);
  insert into app_private.user_tokens (token_hash, user_id, expires_at)
  values (app_private.sha(token), uid, app_private.end_of_school_day());
  return json_build_object('id', uid, 'name', (select name from public.users where id = uid), 'token', token);
end;
$$;
revoke execute on function public.school_test_enter(uuid, text, text) from public;
grant execute on function public.school_test_enter(uuid, text, text) to anon, authenticated;
