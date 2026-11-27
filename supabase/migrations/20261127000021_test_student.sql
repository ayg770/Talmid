-- A "test student" in every class: for trying the materials without giving points to a
-- real student. It can enter without a teacher opening the device, and can reset its
-- own progress.

alter table public.school_people add column is_test boolean not null default false;

insert into public.school_people (kind, external_id, class_id, display_name, is_test)
select 'student', 'test:' || c.name_he, c.id, '🧪 תלמיד בדיקה', true
from public.school_classes c
on conflict (external_id) do nothing;

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
        'id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'has_code', p.own_code,
        'admin', p.is_admin, 'test', p.is_test
      ) order by p.is_test, p.display_name)
      from public.school_people p where p.active
    ), '[]'::json),
    'open', case when dev.expires_at is null then null
                 else json_build_object('teacher', dev.teacher, 'until', dev.expires_at) end
  );
end;
$$;

-- The test student enters even when the device is closed (its token lasts the day).
create or replace function public.school_enter(p_device text, p_person uuid, p_language text default 'he')
returns json language plpgsql security definer set search_path = ''
as $$
declare
  dev app_private.school_devices;
  p public.school_people;
  uid uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into p from public.school_people where id = p_person and active for update;
  if p.id is null then raise exception 'no such person'; end if;
  if p.kind <> 'student' then raise exception 'students only'; end if;
  select * into dev from app_private.school_devices where token_hash = app_private.sha(p_device) and expires_at > now();
  if dev.token_hash is null and not p.is_test then raise exception 'device closed'; end if;
  uid := app_private.school_user(p.id, null, p_language);
  insert into app_private.user_tokens (token_hash, user_id, device_hash, expires_at)
  values (app_private.sha(token), uid, dev.token_hash, coalesce(dev.expires_at, app_private.end_of_school_day()));
  return json_build_object('id', uid, 'name', (select name from public.users where id = uid), 'token', token);
end;
$$;

-- The home says whether this is the test student (to offer a progress reset).
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
    'test', p.is_test,
    'modules', coalesce((
      select json_agg(json_build_object('key', m.key, 'he', m.title_he, 'ru', m.title_ru, 'icon', m.icon) order by m.sort_order)
      from public.school_modules m
      where m.enabled and m.ready and (p.kind = 'teacher' or p.is_test or app_private.in_audience('module', m.key, p.id))
    ), '[]'::json),
    'units', coalesce((
      select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link, 'kind', u.kind,
        'content', u.content, 'category_he', u.category_he, 'category_ru', u.category_ru)
        order by u.category_he nulls last, u.sort_order, u.title)
      from public.school_units u
      where u.published and (p.kind = 'teacher' or p.is_test or app_private.in_audience('unit', u.id::text, p.id))
    ), '[]'::json)
  );
end;
$$;

-- The test student starts over: its answers are deleted.
create or replace function public.test_reset()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if not exists (select 1 from public.school_people where user_id = me and is_test) then
    raise exception 'test student only';
  end if;
  delete from public.unit_answers where user_id = me;
end;
$$;
revoke execute on function public.test_reset() from public;
grant execute on function public.test_reset() to anon, authenticated;
