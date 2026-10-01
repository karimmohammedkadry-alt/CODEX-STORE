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
-- STORAGE: APPLICATION FILES
-- ============================================================
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'app-files','app-files',true,5368709120,null
)
on conflict(id) do update set
  public=true,
  file_size_limit=5368709120,
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
