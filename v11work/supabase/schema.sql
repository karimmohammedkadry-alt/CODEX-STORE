-- =========================================================
-- CODEX APP STORE - SAFE SUPABASE MIGRATION V11
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مستخدم',
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  rating numeric(3,1) not null default 0,
  download_url text,
  download_count bigint not null default 0,
  total_size_bytes bigint not null default 0,
  platform text not null default 'Windows',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apps add column if not exists slug text;
alter table public.apps add column if not exists changelog text not null default '';
alter table public.apps add column if not exists download_count bigint not null default 0;
alter table public.apps add column if not exists total_size_bytes bigint not null default 0;
alter table public.apps add column if not exists platform text not null default 'Windows';
alter table public.apps add column if not exists icon_text text default 'C';
alter table public.apps add column if not exists icon_url text;
alter table public.apps add column if not exists download_url text;

update public.apps
set slug = 'app-' || replace(id::text,'-','')
where slug is null or btrim(slug)='';

-- Make existing duplicate slugs unique without deleting any application.
with duplicates as (
  select id, slug, row_number() over (partition by slug order by id) as rn
  from public.apps
  where slug is not null and btrim(slug) <> ''
)
update public.apps a
set slug = a.slug || '-' || left(a.id::text,8)
from duplicates d
where a.id=d.id and d.rn>1;

create unique index if not exists apps_slug_unique_idx on public.apps(slug);
alter table public.apps alter column slug set not null;

create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  platform text not null check (platform in ('windows','android')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(app_id, platform)
);

-- =========================================================
-- ADMIN CHECK
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
\ncreate or replace function public.current_profile_role()\nreturns text\nlanguage sql\nstable\nsecurity definer\nset search_path = public\nas $$\n  select role from public.profiles where id = auth.uid();\n$$;\n\ngrant execute on function public.current_profile_role() to authenticated;\n
-- =========================================================
-- DOWNLOAD COUNTER
-- =========================================================

create or replace function public.increment_app_download(p_app_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.apps
  set download_count = coalesce(download_count,0) + 1
  where id = p_app_id;
$$;

grant execute on function public.increment_app_download(uuid) to anon, authenticated;

-- =========================================================
-- NEW USER PROFILE
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,name,email,role)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'name','مستخدم'),
    new.email,
    'user'
  )
  on conflict (id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.app_files enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert to authenticated
with check (
  id = auth.uid()
  and role = 'user'
  and coalesce(email,'') = coalesce((auth.jwt() ->> 'email'),'')
);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_profile_role()
  and coalesce(email,'') = coalesce((auth.jwt() ->> 'email'),'')
);

-- The client only needs to change name/email. Role/timestamps are controlled by server-side code.
revoke update on public.profiles from authenticated;
grant update(name, email) on public.profiles to authenticated;

drop policy if exists "apps_public_read" on public.apps;
create policy "apps_public_read"
on public.apps for select to anon, authenticated
using (true);

drop policy if exists "apps_admin_insert" on public.apps;
create policy "apps_admin_insert"
on public.apps for insert to authenticated
with check (public.is_admin());

drop policy if exists "apps_admin_update" on public.apps;
create policy "apps_admin_update"
on public.apps for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "apps_admin_delete" on public.apps;
create policy "apps_admin_delete"
on public.apps for delete to authenticated
using (public.is_admin());

drop policy if exists "app_files_public_read" on public.app_files;
create policy "app_files_public_read"
on public.app_files for select to anon, authenticated
using (true);

drop policy if exists "app_files_admin_insert" on public.app_files;
create policy "app_files_admin_insert"
on public.app_files for insert to authenticated
with check (public.is_admin());

drop policy if exists "app_files_admin_update" on public.app_files;
create policy "app_files_admin_update"
on public.app_files for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "app_files_admin_delete" on public.app_files;
create policy "app_files_admin_delete"
on public.app_files for delete to authenticated
using (public.is_admin());

-- =========================================================
-- STORAGE
-- =========================================================

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('app-files','app-files',true,null,null)
on conflict(id) do update set
  public=true,
  file_size_limit=null,
  allowed_mime_types=null;

drop policy if exists "app_files_storage_public_read" on storage.objects;
create policy "app_files_storage_public_read"
on storage.objects for select to anon, authenticated
using (bucket_id='app-files');

drop policy if exists "app_files_storage_admin_insert" on storage.objects;
create policy "app_files_storage_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='app-files'
  and public.is_admin()
  and (
    storage.extension(name) in ('exe','apk','png','jpg','jpeg','webp')
  )
);

drop policy if exists "app_files_storage_admin_update" on storage.objects;
create policy "app_files_storage_admin_update"
on storage.objects for update to authenticated
using (bucket_id='app-files' and public.is_admin())
with check (
  bucket_id='app-files'
  and public.is_admin()
  and storage.extension(name) in ('exe','apk','png','jpg','jpeg','webp')
);

drop policy if exists "app_files_storage_admin_delete" on storage.objects;
create policy "app_files_storage_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id='app-files' and public.is_admin());

-- =========================================================
-- VERIFY
-- =========================================================

select tablename, rowsecurity
from pg_tables
where schemaname='public'
and tablename in ('profiles','apps','app_files')
order by tablename;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
where id='app-files';
