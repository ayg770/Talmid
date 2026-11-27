-- Progress board for teachers: any active teacher (not only admins) signs in with their code
-- and sees every student's progress in the learning units. Read only.
--
-- Sessions reuse app_private.admin_sessions (token → person). admin_person() still requires
-- is_admin, so a teacher's session never opens the admin panel.

create or replace function app_private.staff_person(p_token text)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare
  who uuid;
begin
  select s.person into who from app_private.admin_sessions s
  join public.school_people p on p.id = s.person and p.kind = 'teacher' and p.active
  where s.token_hash = app_private.sha(p_token) and s.expires_at > now();
  if who is null then raise exception 'staff session expired'; end if;
  return who;
end;
$$;

create or replace function public.staff_login(p_person uuid, p_code text)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  p public.school_people := app_private.school_check_code(p_person, p_code);
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p.kind <> 'teacher' then raise exception 'not a teacher'; end if;
  delete from app_private.admin_sessions where expires_at < now();
  insert into app_private.admin_sessions values (app_private.sha(token), p.id, now() + interval '12 hours');
  return json_build_object('token', token, 'name', p.display_name);
end;
$$;

-- Everything the board needs in one call. Answers are reduced to the latest answer per
-- exercise (what the pass rule looks at), plus attempt counts. The test student is excluded.
create or replace function public.staff_progress(p_token text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare
  who uuid := app_private.staff_person(p_token);
begin
  return json_build_object(
    'me', who,
    'classes', (select json_agg(json_build_object('id', c.id, 'he', c.name_he) order by c.sort_order) from public.school_classes c),
    'units', coalesce((
      select json_agg(json_build_object('id', u.id, 'title', u.title, 'category', u.category_he, 'content', u.content)
                      order by u.category_he nulls last, u.sort_order, u.title)
      from public.school_units u where u.kind = 'story' and u.published and u.content is not null
    ), '[]'::json),
    'students', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.display_name, 'class', p.class_id, 'entered', p.user_id is not null)
                      order by p.display_name)
      from public.school_people p where p.kind = 'student' and p.active and not p.is_test
    ), '[]'::json),
    'answers', coalesce((
      select json_agg(json_build_object('s', l.person, 'u', l.unit_id, 'l', l.level, 'e', l.exercise,
                                        'c', l.correct, 'ms', l.ms, 'n', l.tries, 'at', l.created_at))
      from (
        select distinct on (a.user_id, a.unit_id, a.level, a.exercise)
               p.id as person, a.unit_id, a.level, a.exercise, a.correct, a.ms, a.created_at,
               count(*) over (partition by a.user_id, a.unit_id, a.level, a.exercise) as tries
        from public.unit_answers a
        join public.school_people p on p.user_id = a.user_id and p.kind = 'student' and p.active and not p.is_test
        order by a.user_id, a.unit_id, a.level, a.exercise, a.created_at desc
      ) l
    ), '[]'::json)
  );
end;
$$;

revoke all on function app_private.staff_person(text) from public, anon, authenticated;
grant execute on function public.staff_login(uuid, text) to anon, authenticated;
grant execute on function public.staff_progress(text) to anon, authenticated;
