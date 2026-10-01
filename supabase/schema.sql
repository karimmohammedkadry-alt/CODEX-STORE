-- ============================================================
-- CODEX APP STORE - SAFE SUPABASE MIGRATION V12
-- ============================================================
-- Does NOT drop tables or delete existing app/user data.
-- Preserves existing ENUMs such as user_role/app_platform.
-- Uses two public buckets:
--   app-files  = EXE/APK
--   app-icons  = PNG/JPG/JPEG/WEBP
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مستخدم',
  email text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;

update public.profiles set name='مستخدم' where name is null or btrim(name)='';
update public.profiles set created_at=now() where created_at is null;
update public.profiles set updated_at=now() where updated_at is null;

update public.profiles p
set email=u.email
from auth.users u
where u.id=p.id
  and (p.email is null or btrim(p.email)='');

-- ============================================================
-- APPS
-- ============================================================
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  description text not null default '',
  changelog text not null default '',
  category text not null default 'tools',
  category_name text not null default 'الأدوات',
  version text not null default '1.0.0',
  icon_text text default 'C',
  icon_url text,
  icon_storage_path text,
  rating numeric(3,1) not null default 0,
  download_url text,
  download_count bigint not null default 0,
  total_size_bytes bigint not null default 0,
  platform text not null default 'Windows',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apps add column if not exists name text;
alter table public.apps add column if not exists slug text;
alter table public.apps add column if not exists description text;
alter table public.apps add column if not exists changelog text;
alter table public.apps add column if not exists category text;
alter table public.apps add column if not exists category_name text;
alter table public.apps add column if not exists version text;
alter table public.apps add column if not exists icon_text text;
alter table public.apps add column if not exists icon_url text;
alter table public.apps add column if not exists icon_storage_path text;
alter table public.apps add column if not exists rating numeric(3,1);
alter table public.apps add column if not exists download_url text;
alter table public.apps add column if not exists download_count bigint;
alter table public.apps add column if not exists total_size_bytes bigint;
alter table public.apps add column if not exists platform text;
alter table public.apps add column if not exists created_by uuid;
alter table public.apps add column if not exists created_at timestamptz;
alter table public.apps add column if not exists updated_at timestamptz;

update public.apps set name='Application' where name is null or btrim(name)='';
update public.apps set description='' where description is null;
update public.apps set changelog='' where changelog is null;
update public.apps set category='tools' where category is null or btrim(category)='';
update public.apps set category_name='الأدوات' where category_name is null or btrim(category_name)='';
update public.apps set version='1.0.0' where version is null or btrim(version)='';
update public.apps set rating=0 where rating is null;
update public.apps set download_count=0 where download_count is null;
update public.apps set total_size_bytes=0 where total_size_bytes is null;
update public.apps set created_at=now() where created_at is null;
update public.apps set updated_at=now() where updated_at is null;

-- Image remains optional.
alter table public.apps alter column icon_url drop not null;
alter table public.apps alter column icon_storage_path drop not null;
alter table public.apps alter column download_url drop not null;
alter table public.apps alter column icon_text drop not null;

-- Fill missing slugs without relying on Arabic regex.
update public.apps
set slug='app-' || replace(id::text,'-','')
where slug is null or btrim(slug)='';

-- Fix duplicate slugs without deleting data.
with duplicates as (
  select id,slug,row_number() over(partition by slug order by id) rn
  from public.apps
  where slug is not null and btrim(slug)<>''
)
update public.apps a
set slug=a.slug || '-' || left(replace(a.id::text,'-',''),8)
from duplicates d
where a.id=d.id and d.rn>1;

create unique index if not exists apps_slug_unique_idx on public.apps(slug);

-- ============================================================
-- APP FILES
-- ============================================================
create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null,
  platform text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.app_files add column if not exists app_id uuid;
alter table public.app_files add column if not exists platform text;
alter table public.app_files add column if not exists file_name text;
alter table public.app_files add column if not exists storage_path text;
alter table public.app_files add column if not exists mime_type text;
alter table public.app_files add column if not exists size_bytes bigint;
alter table public.app_files add column if not exists created_at timestamptz;

update public.app_files set size_bytes=0 where size_bytes is null;
update public.app_files set created_at=now() where created_at is null;

-- Preserve existing platform type (including app_platform ENUM).

create index if not exists app_files_app_id_idx on public.app_files(app_id);
create index if not exists app_files_platform_idx on public.app_files(platform);

-- Ensure ON CONFLICT (app_id, platform) works without changing the existing platform type.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='app_files_app_platform_unique_idx'
  ) then
    if not exists (
      select 1 from public.app_files
      group by app_id, platform
      having count(*) > 1
    ) then
      create unique index app_files_app_platform_unique_idx
      on public.app_files(app_id, platform);
    else
      raise notice 'Duplicate app_files rows for one app/platform exist; unique index was not created.';
    end if;
  end if;
end
$$;

-- Add FK only if it will not fail because of orphan records.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.app_files'::regclass
      and contype='f'
      and pg_get_constraintdef(oid) like '%references public.apps%'
  ) then
    if not exists (
      select 1 from public.app_files f
      where f.app_id is not null
        and not exists(select 1 from public.apps a where a.id=f.app_id)
    ) then
      begin
        alter table public.app_files
          add constraint app_files_app_id_fkey
          foreign key(app_id) references public.apps(id) on delete cascade;
      exception when duplicate_object then null;
      end;
    else
      raise notice 'Orphan app_files rows exist; FK was not added to avoid deleting or altering data.';
    end if;
  end if;
end
$$;

-- ============================================================
-- AUTH / ROLE HELPERS
-- Works with text role or user_role ENUM via ::text.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.profiles
    where id=auth.uid() and role::text='admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.current_profile_role()
returns text
language sql stable security definer
set search_path=public,pg_temp
as $$
  select role::text from public.profiles where id=auth.uid() limit 1;
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated;

-- ============================================================
-- PLATFORM ENUM COMPATIBILITY HELPERS
-- Supports existing text columns and ENUM columns such as
-- public.app_platform without changing their type.
-- ============================================================
create or replace function public.resolve_platform_value(
  p_table text,
  p_platform text
)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_udt_schema text;
  v_udt_name text;
  v_enum_value text;
  v_wants text := lower(trim(coalesce(p_platform,'')));
begin
  select udt_schema, udt_name
    into v_udt_schema, v_udt_name
  from information_schema.columns
  where table_schema='public'
    and table_name=p_table
    and column_name='platform';

  if v_udt_name is null then
    raise exception '%: platform column not found', p_table;
  end if;

  -- Plain text-like columns: preserve the logical value.
  if v_udt_name in ('text','varchar','bpchar') then
    return lower(trim(p_platform));
  end if;

  -- Existing ENUM column: resolve the exact enum label already present.
  select e.enumlabel
    into v_enum_value
  from pg_type t
  join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname=v_udt_schema
    and t.typname=v_udt_name
    and (
      lower(e.enumlabel)=v_wants
      or (
        v_wants='windows'
        and lower(e.enumlabel) in ('win','exe','pc','desktop')
      )
      or (
        v_wants='android'
        and lower(e.enumlabel) in ('apk','mobile')
      )
    )
  order by
    case
      when lower(e.enumlabel)=v_wants then 0
      else 1
    end,
    e.enumsortorder
  limit 1;

  if v_enum_value is not null then
    return v_enum_value;
  end if;

  -- Give a useful error rather than a cryptic enum cast failure.
  raise exception 'Invalid platform "%" for %. Allowed values: %',
    p_platform,
    p_table,
    (
      select string_agg(e.enumlabel, ', ' order by e.enumsortorder)
      from pg_type t
      join pg_enum e on e.enumtypid=t.oid
      join pg_namespace n on n.oid=t.typnamespace
      where n.nspname=v_udt_schema
        and t.typname=v_udt_name
    );
end;
$$;

revoke all on function public.resolve_platform_value(text,text) from public;
grant execute on function public.resolve_platform_value(text,text) to authenticated;

-- ============================================================
-- CREATE APP RECORD RPC
-- Fixes existing app_platform ENUM mismatches.
-- ============================================================
create or replace function public.create_app_record(
  p_name text,
  p_slug text,
  p_description text,
  p_changelog text,
  p_category text,
  p_category_name text,
  p_version text,
  p_icon_text text,
  p_created_by uuid,
  p_total_size_bytes bigint,
  p_platform text
)
returns public.apps
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_udt_schema text;
  v_udt_name text;
  v_platform text;
  v_row public.apps;
  v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  if p_created_by is null or p_created_by <> auth.uid() then
    raise exception 'invalid_creator';
  end if;

  select udt_schema, udt_name
    into v_udt_schema, v_udt_name
  from information_schema.columns
  where table_schema='public'
    and table_name='apps'
    and column_name='platform';

  v_platform := public.resolve_platform_value('apps', p_platform);

  if exists (
    select 1
    from public.apps
    where slug=p_slug
  ) then
    p_slug := p_slug || '-' || left(replace(v_id::text,'-',''),8);
  end if;

  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname=v_udt_schema
      and t.typname=v_udt_name
      and t.typtype='e'
  ) then
    execute format(
      'insert into public.apps (id,name,slug,description,changelog,category,category_name,version,icon_text,created_by,total_size_bytes,platform,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::%I.%I,now()) returning *',
      v_udt_schema,
      v_udt_name
    )
    using
      v_id,
      p_name,
      p_slug,
      p_description,
      p_changelog,
      p_category,
      p_category_name,
      p_version,
      p_icon_text,
      p_created_by,
      coalesce(p_total_size_bytes,0),
      v_platform
    into v_row;
  else
    insert into public.apps (
      id,name,slug,description,changelog,category,category_name,
      version,icon_text,created_by,total_size_bytes,platform,updated_at
    )
    values (
      v_id,p_name,p_slug,p_description,p_changelog,p_category,p_category_name,
      p_version,p_icon_text,p_created_by,coalesce(p_total_size_bytes,0),v_platform,now()
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.create_app_record(text,text,text,text,text,text,text,text,uuid,bigint,text) from public;
grant execute on function public.create_app_record(text,text,text,text,text,text,text,text,uuid,bigint,text) to authenticated;

-- ============================================================
-- APP FILE SAVE RPC - FINAL ENUM-SAFE VERSION
-- ============================================================
create or replace function public.save_app_file(
  p_app_id uuid,
  p_platform text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.app_files
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_udt_schema text;
  v_udt_name text;
  v_platform text;
  v_row public.app_files;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  if not exists (
    select 1
    from public.apps
    where id=p_app_id
  ) then
    raise exception 'app_not_found';
  end if;

  v_platform := public.resolve_platform_value('app_files', p_platform);

  select udt_schema, udt_name
    into v_udt_schema, v_udt_name
  from information_schema.columns
  where table_schema='public'
    and table_name='app_files'
    and column_name='platform';

  if exists (
    select 1
    from public.app_files
    where app_id=p_app_id
      and lower(platform::text)=lower(v_platform)
  ) then

    if v_udt_name in ('text','varchar','bpchar') then
      update public.app_files
      set
        file_name=p_file_name,
        storage_path=p_storage_path,
        mime_type=p_mime_type,
        size_bytes=coalesce(p_size_bytes,0)
      where app_id=p_app_id
        and lower(platform::text)=lower(v_platform)
      returning * into v_row;
    else
      execute format(
        'update public.app_files set file_name=$3, storage_path=$4, mime_type=$5, size_bytes=$6 where app_id=$1 and lower(platform::text)=lower($2) returning *'
      )
      using p_app_id, v_platform, p_file_name, p_storage_path, p_mime_type, coalesce(p_size_bytes,0)
      into v_row;
    end if;

    return v_row;
  end if;

  if v_udt_name in ('text','varchar','bpchar') then
    insert into public.app_files (
      app_id,platform,file_name,storage_path,mime_type,size_bytes
    )
    values (
      p_app_id,v_platform,p_file_name,p_storage_path,p_mime_type,coalesce(p_size_bytes,0)
    )
    returning * into v_row;
  else
    execute format(
      'insert into public.app_files(app_id,platform,file_name,storage_path,mime_type,size_bytes) values($1,$2::%I.%I,$3,$4,$5,$6) returning *',
      v_udt_schema,
      v_udt_name
    )
    using p_app_id, v_platform, p_file_name, p_storage_path, p_mime_type, coalesce(p_size_bytes,0)
    into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_app_file(uuid,text,text,text,text,bigint) from public;
grant execute on function public.save_app_file(uuid,text,text,text,text,bigint) to authenticated;

-- ============================================================
-- DOWNLOAD COUNTER
-- ============================================================
create or replace function public.increment_app_download(p_app_id uuid)
returns void
language sql security definer
set search_path=public,pg_temp
as $$
  update public.apps
  set download_count=coalesce(download_count,0)+1
  where id=p_app_id;
$$;

revoke all on function public.increment_app_download(uuid) from public;
grant execute on function public.increment_app_download(uuid) to anon,authenticated;

-- ============================================================
-- USER PROFILE TRIGGERS
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.profiles(id,name,email,role)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'name','مستخدم'),
    new.email,
    'user'
  )
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

create or replace function public.handle_user_update()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  update public.profiles
  set
    email=new.email,
    name=coalesce(new.raw_user_meta_data->>'name',name,'مستخدم'),
    updated_at=now()
  where id=new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email,raw_user_meta_data on auth.users
for each row execute function public.handle_user_update();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists apps_updated_at on public.apps;
create trigger apps_updated_at
before update on public.apps
for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.app_files enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles for select to authenticated
using(id=auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles for insert to authenticated
with check(id=auth.uid() and role::text='user');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update to authenticated
using(id=auth.uid())
with check(id=auth.uid() and role::text=public.current_profile_role());

drop policy if exists apps_public_read on public.apps;
create policy apps_public_read
on public.apps for select to anon,authenticated
using(true);

drop policy if exists apps_admin_insert on public.apps;
create policy apps_admin_insert
on public.apps for insert to authenticated
with check(public.is_admin());

drop policy if exists apps_admin_update on public.apps;
create policy apps_admin_update
on public.apps for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists apps_admin_delete on public.apps;
create policy apps_admin_delete
on public.apps for delete to authenticated
using(public.is_admin());

drop policy if exists app_files_public_read on public.app_files;
create policy app_files_public_read
on public.app_files for select to anon,authenticated
using(true);

drop policy if exists app_files_admin_insert on public.app_files;
create policy app_files_admin_insert
on public.app_files for insert to authenticated
with check(public.is_admin());

drop policy if exists app_files_admin_update on public.app_files;
create policy app_files_admin_update
on public.app_files for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists app_files_admin_delete on public.app_files;
create policy app_files_admin_delete
on public.app_files for delete to authenticated
using(public.is_admin());

-- ============================================================
-- APP FILE SAVE RPC
-- Handles text or enum app_files.platform safely.
-- ============================================================
create or replace function public.save_app_file(
  p_app_id uuid,
  p_platform text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.app_files
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_udt_schema text;
  v_udt_name text;
  v_row public.app_files;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  if not exists (select 1 from public.apps where id=p_app_id) then
    raise exception 'app_not_found';
  end if;

  select udt_schema, udt_name
  into v_udt_schema, v_udt_name
  from information_schema.columns
  where table_schema='public'
    and table_name='app_files'
    and column_name='platform';

  if v_udt_name is null then
    raise exception 'platform_column_not_found';
  end if;

  if exists (
    select 1
    from public.app_files
    where app_id=p_app_id
      and platform::text=p_platform
  ) then
    if v_udt_name in ('text','varchar','bpchar') then
      update public.app_files
      set file_name=p_file_name,
          storage_path=p_storage_path,
          mime_type=p_mime_type,
          size_bytes=p_size_bytes
      where app_id=p_app_id
        and platform::text=p_platform
      returning * into v_row;
    else
      execute format(
        'update public.app_files set file_name=$3, storage_path=$4, mime_type=$5, size_bytes=$6 where app_id=$1 and platform=$2::%I.%I returning *',
        v_udt_schema, v_udt_name
      )
      using p_app_id, p_platform, p_file_name, p_storage_path, p_mime_type, p_size_bytes
      into v_row;
    end if;

    return v_row;
  end if;

  if v_udt_name in ('text','varchar','bpchar') then
    insert into public.app_files(app_id,platform,file_name,storage_path,mime_type,size_bytes)
    values(p_app_id,p_platform,p_file_name,p_storage_path,p_mime_type,p_size_bytes)
    returning * into v_row;
  else
    execute format(
      'insert into public.app_files(app_id,platform,file_name,storage_path,mime_type,size_bytes) values($1,$2::%I.%I,$3,$4,$5,$6) returning *',
      v_udt_schema, v_udt_name
    )
    using p_app_id, p_platform, p_file_name, p_storage_path, p_mime_type, p_size_bytes
    into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_app_file(uuid,text,text,text,text,bigint) from public;
grant execute on function public.save_app_file(uuid,text,text,text,text,bigint) to authenticated;

-- ============================================================
-- REAL DOWNLOAD EVENTS
-- The counter represents real download-start requests recorded by the app,
-- with one count per visitor/file/day to prevent repeated-click inflation.
-- ============================================================
create table if not exists public.download_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  file_key text not null default 'download',
  visitor_id uuid not null,
  download_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(app_id,file_key,visitor_id,download_date)
);

create index if not exists download_events_app_id_idx
on public.download_events(app_id);

alter table public.download_events enable row level security;

-- The previous increment-only counter is intentionally disabled.
do $$
begin
  if to_regprocedure('public.increment_app_download(uuid)') is not null then
    revoke all on function public.increment_app_download(uuid) from anon,authenticated;
  end if;
end
$$;

-- Rebuild the displayed counter from the real event table.
update public.apps a
set download_count = (
  select count(*)
  from public.download_events d
  where d.app_id = a.id
);

create or replace function public.register_app_download(
  p_app_id uuid,
  p_file_key text,
  p_visitor_id uuid
)
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count bigint;
  v_inserted integer;
begin
  if p_app_id is null or not exists(select 1 from public.apps where id=p_app_id) then
    return 0;
  end if;

  if p_visitor_id is null then
    return 0;
  end if;

  insert into public.download_events(app_id,file_key,visitor_id)
  values(p_app_id,coalesce(nullif(trim(p_file_key),''),'download'),p_visitor_id)
  on conflict(app_id,file_key,visitor_id,download_date) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.apps
    set download_count=coalesce(download_count,0)+1
    where id=p_app_id;
  end if;

  select coalesce(download_count,0) into v_count
  from public.apps
  where id=p_app_id;

  return coalesce(v_count,0);
end;
$$;

revoke all on function public.register_app_download(uuid,text,uuid) from public;
grant execute on function public.register_app_download(uuid,text,uuid) to anon,authenticated;

-- ============================================================
-- STORAGE: APPLICATION FILES
-- ============================================================
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'app-files','app-files',true,null,null
)
on conflict(id) do update set
  public=true,
  file_size_limit=null,
  allowed_mime_types=null;

drop policy if exists app_files_storage_public_read on storage.objects;
create policy app_files_storage_public_read
on storage.objects for select to anon,authenticated
using(bucket_id='app-files');

drop policy if exists app_files_storage_admin_insert on storage.objects;
create policy app_files_storage_admin_insert
on storage.objects for insert to authenticated
with check(
  bucket_id='app-files'
  and public.is_admin()
  and lower(storage.extension(name)) in('exe','apk')
);

drop policy if exists app_files_storage_admin_update on storage.objects;
create policy app_files_storage_admin_update
on storage.objects for update to authenticated
using(bucket_id='app-files' and public.is_admin())
with check(
  bucket_id='app-files'
  and public.is_admin()
  and lower(storage.extension(name)) in('exe','apk')
);

drop policy if exists app_files_storage_admin_delete on storage.objects;
create policy app_files_storage_admin_delete
on storage.objects for delete to authenticated
using(bucket_id='app-files' and public.is_admin());

-- ============================================================
-- STORAGE: APPLICATION ICONS
-- Separate bucket avoids EXE/APK/image rule conflicts.
-- ============================================================
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'app-icons','app-icons',true,8388608,null
)
on conflict(id) do update set
  public=true,
  file_size_limit=8388608,
  allowed_mime_types=null;

drop policy if exists app_icons_storage_public_read on storage.objects;
create policy app_icons_storage_public_read
on storage.objects for select to anon,authenticated
using(bucket_id='app-icons');

drop policy if exists app_icons_storage_admin_insert on storage.objects;
create policy app_icons_storage_admin_insert
on storage.objects for insert to authenticated
with check(
  bucket_id='app-icons'
  and public.is_admin()
  and lower(storage.extension(name)) in('png','jpg','jpeg','webp')
);

drop policy if exists app_icons_storage_admin_update on storage.objects;
create policy app_icons_storage_admin_update
on storage.objects for update to authenticated
using(bucket_id='app-icons' and public.is_admin())
with check(
  bucket_id='app-icons'
  and public.is_admin()
  and lower(storage.extension(name)) in('png','jpg','jpeg','webp')
);

drop policy if exists app_icons_storage_admin_delete on storage.objects;
create policy app_icons_storage_admin_delete
on storage.objects for delete to authenticated
using(bucket_id='app-icons' and public.is_admin());

-- ============================================================
-- GRANTS
-- ============================================================
grant select on public.apps to anon,authenticated;
grant insert,update,delete on public.apps to authenticated;
grant select on public.app_files to anon,authenticated;
grant insert,update,delete on public.app_files to authenticated;
grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update(name,email) on public.profiles to authenticated;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists apps_category_idx on public.apps(category);
create index if not exists apps_updated_at_idx on public.apps(updated_at desc);
create index if not exists apps_download_count_idx on public.apps(download_count desc);

-- ============================================================
-- VERIFICATION
-- ============================================================
select schemaname,tablename,rowsecurity as rls_enabled
from pg_tables
where schemaname='public'
and tablename in('profiles','apps','app_files')
order by tablename;

select column_name,data_type,udt_name,is_nullable
from information_schema.columns
where table_schema='public' and table_name='apps'
order by ordinal_position;

select column_name,data_type,udt_name,is_nullable
from information_schema.columns
where table_schema='public' and table_name='app_files'
order by ordinal_position;

select n.nspname as schema_name,t.typname as enum_name,e.enumlabel as enum_value
from pg_type t
join pg_enum e on e.enumtypid=t.oid
join pg_namespace n on n.oid=t.typnamespace
where t.typtype='e'
and t.typname in('user_role','app_platform')
order by t.typname,e.enumsortorder;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
where id in('app-files','app-icons')
order by id;

select schemaname,tablename,policyname,roles,cmd
from pg_policies
where (schemaname='public' and tablename in('profiles','apps','app_files'))
   or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

select
  (select count(*) from public.apps) as apps_count,
  (select count(*) from public.app_files) as app_files_count,
  (select count(*) from public.profiles) as profiles_count;
