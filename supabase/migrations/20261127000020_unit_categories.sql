-- Learning units are grouped in categories (e.g. "רוסית / Русский язык").

alter table public.school_units add column category_he text;
alter table public.school_units add column category_ru text;

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
      select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link, 'kind', u.kind,
        'content', u.content, 'category_he', u.category_he, 'category_ru', u.category_ru)
        order by u.category_he nulls last, u.sort_order, u.title)
      from public.school_units u
      where u.published and (p.kind = 'teacher' or app_private.in_audience('unit', u.id::text, p.id))
    ), '[]'::json)
  );
end;
$$;

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
    'units', coalesce((select json_agg(json_build_object('id', u.id, 'title', u.title, 'body', u.body, 'link', u.link,
        'published', u.published, 'sort_order', u.sort_order, 'kind', u.kind,
        'category_he', u.category_he, 'category_ru', u.category_ru)
        order by u.category_he nulls last, u.sort_order, u.title) from public.school_units u), '[]'::json),
    'classes', (select json_agg(json_build_object('id', c.id, 'he', c.name_he) order by c.sort_order) from public.school_classes c),
    'people', (select json_agg(json_build_object('id', p.id, 'kind', p.kind, 'class', p.class_id, 'name', p.display_name, 'admin', p.is_admin, 'has_code', p.own_code) order by p.display_name) from public.school_people p where p.active)
  );
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
    insert into public.school_units (title, body, link, published, sort_order, created_by, category_he, category_ru)
    values (btrim(p_unit->>'title'), coalesce(p_unit->>'body', ''), nullif(btrim(p_unit->>'link'), ''),
            coalesce((p_unit->>'published')::boolean, false), coalesce((p_unit->>'sort_order')::int, 0), who,
            nullif(btrim(p_unit->>'category_he'), ''), nullif(btrim(p_unit->>'category_ru'), ''))
    returning id into uid;
  else
    update public.school_units set
      title = btrim(p_unit->>'title'), body = coalesce(p_unit->>'body', ''), link = nullif(btrim(p_unit->>'link'), ''),
      published = coalesce((p_unit->>'published')::boolean, false), sort_order = coalesce((p_unit->>'sort_order')::int, 0),
      category_he = nullif(btrim(p_unit->>'category_he'), ''), category_ru = nullif(btrim(p_unit->>'category_ru'), ''),
      updated_at = now()
    where id = uid;
  end if;
  return uid;
end;
$$;
