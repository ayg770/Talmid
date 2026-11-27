-- Automatic sync of students and teachers from the school systems.
--
-- The timetable project's `roster-feed` function returns the students (pulled live from the
-- cheder system) and the active teachers. The `sync-roster` edge function here fetches it and
-- calls apply_roster(). pg_cron runs it every hour; an admin can also run it from the panel.
--
-- Secrets (feed key, sync key) live only in app_private.settings and are set outside this file.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Config for the edge function (service role only).
create or replace function public.roster_sync_config()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'feed_url', (select value from app_private.settings where key = 'roster_feed_url'),
    'feed_key', (select value from app_private.settings where key = 'roster_feed_key'),
    'sync_key', (select value from app_private.settings where key = 'roster_sync_key')
  );
$$;

-- Is this admin-panel token valid? (service role only, for "sync now")
create or replace function public.roster_admin_ok(p_token text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  return true;
exception when others then
  return false;
end;
$$;

-- Apply a feed: {students:[{id,first,last,class}], teachers:[{id,name}]}.
-- Upserts by external_id; anyone not in the feed becomes inactive (never deleted, so their
-- answers and notes stay). Test students and admins are never touched.
create or replace function public.apply_roster(p jsonb)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  n_students int := jsonb_array_length(coalesce(p->'students', '[]'));
  n_teachers int := jsonb_array_length(coalesce(p->'teachers', '[]'));
  added int := 0;
  updated int := 0;
  returned int := 0;
  left_ int := 0;
  seen text[];
  result json;
begin
  if n_students < 20 or n_teachers < 3 then
    raise exception 'roster too small (% students, % teachers) — not applied', n_students, n_teachers;
  end if;

  create temp table incoming on commit drop as
  select s->>'id' as external_id, 'student'::text as kind,
         trim(coalesce(s->>'first', '') || ' ' || coalesce(s->>'last', '')) as display_name,
         c.id as class_id
  from jsonb_array_elements(p->'students') s
  join public.school_classes c on c.name_he = s->>'class'
  where coalesce(s->>'id', '') <> '' and coalesce(s->>'first', '') <> ''
  union all
  select 't:' || (t->>'id'), 'teacher', trim(t->>'name'), null::uuid
  from jsonb_array_elements(p->'teachers') t
  where coalesce(t->>'id', '') <> '' and coalesce(t->>'name', '') <> '';

  select count(*) into added from incoming i
  where not exists (select 1 from public.school_people sp where sp.external_id = i.external_id);

  select count(*) into updated from incoming i
  join public.school_people sp on sp.external_id = i.external_id
  where sp.active and (sp.display_name is distinct from i.display_name or sp.class_id is distinct from i.class_id);

  select count(*) into returned from incoming i
  join public.school_people sp on sp.external_id = i.external_id
  where not sp.active;

  insert into public.school_people (kind, external_id, class_id, display_name, active)
  select kind, external_id, class_id, display_name, true from incoming
  on conflict (external_id) do update
    set class_id = excluded.class_id,
        display_name = excluded.display_name,
        kind = excluded.kind,
        active = true
    where public.school_people.class_id is distinct from excluded.class_id
       or public.school_people.display_name is distinct from excluded.display_name
       or public.school_people.kind is distinct from excluded.kind
       or not public.school_people.active;

  select array_agg(external_id) into seen from incoming;

  update public.school_people sp set active = false
  where sp.active and not sp.is_test and not sp.is_admin
    and sp.external_id is not null and sp.external_id not like 'test:%'
    and not (sp.external_id = any (seen));
  get diagnostics left_ = row_count;

  result := json_build_object('at', now(), 'added', added, 'updated', updated, 'returned', returned,
                              'left', left_, 'students', n_students, 'teachers', n_teachers);
  insert into app_private.settings (key, value) values ('roster_last_sync', result::text)
  on conflict (key) do update set value = excluded.value;
  return result;
end;
$$;

-- Record a failed run so the panel can show it.
create or replace function public.roster_sync_failed(p_error text)
returns void language sql security definer set search_path = ''
as $$
  insert into app_private.settings (key, value)
  values ('roster_last_error', json_build_object('at', now(), 'error', left(p_error, 300))::text)
  on conflict (key) do update set value = excluded.value;
$$;

-- For the admin panel.
create or replace function public.admin_roster_status(p_token text)
returns json language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.admin_person(p_token);
  return json_build_object(
    'last', (select value::json from app_private.settings where key = 'roster_last_sync'),
    'error', (select value::json from app_private.settings where key = 'roster_last_error'),
    'inactive', (select count(*) from public.school_people where not active and not is_test)
  );
end;
$$;

revoke all on function public.roster_sync_config() from public, anon, authenticated;
revoke all on function public.roster_admin_ok(text) from public, anon, authenticated;
revoke all on function public.apply_roster(jsonb) from public, anon, authenticated;
revoke all on function public.roster_sync_failed(text) from public, anon, authenticated;
grant execute on function public.roster_sync_config() to service_role;
grant execute on function public.roster_admin_ok(text) to service_role;
grant execute on function public.apply_roster(jsonb) to service_role;
grant execute on function public.roster_sync_failed(text) to service_role;
grant execute on function public.admin_roster_status(text) to anon, authenticated;

-- Hourly run: post to the edge function with the sync key.
create or replace function app_private.run_roster_sync()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  k text := (select value from app_private.settings where key = 'roster_sync_key');
  u text := (select value from app_private.settings where key = 'roster_sync_url');
begin
  if k is null or u is null then return null; end if;
  return net.http_post(u, '{}'::jsonb, '{}'::jsonb,
                       jsonb_build_object('content-type', 'application/json', 'x-sync-key', k), 60000);
end;
$$;

select cron.schedule('roster-sync', '17 * * * *', $$select app_private.run_roster_sync()$$);
