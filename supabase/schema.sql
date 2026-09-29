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
  description text not null default '',
  category text not null default 'tools',
  category_name text not null default 'الأدوات',
  version text not null default '1.0.0',
  icon_text text default 'C',
  icon_url text,
  rating numeric(3,1) default 0,
  download_url text,
  total_size_bytes bigint not null default 0,
  platform text not null default 'Windows',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id,name,email,role) values(new.id, coalesce(new.raw_user_meta_data->>'name','مستخدم'), new.email, 'user') on conflict (id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.app_files enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "apps_public_read" on public.apps;
create policy "apps_public_read" on public.apps for select to anon, authenticated using (true);
drop policy if exists "apps_admin_insert" on public.apps;
create policy "apps_admin_insert" on public.apps for insert to authenticated with check (public.is_admin());
drop policy if exists "apps_admin_update" on public.apps;
create policy "apps_admin_update" on public.apps for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "apps_admin_delete" on public.apps;
create policy "apps_admin_delete" on public.apps for delete to authenticated using (public.is_admin());

drop policy if exists "app_files_public_read" on public.app_files;
create policy "app_files_public_read" on public.app_files for select to anon, authenticated using (true);
drop policy if exists "app_files_admin_insert" on public.app_files;
create policy "app_files_admin_insert" on public.app_files for insert to authenticated with check (public.is_admin());
drop policy if exists "app_files_admin_update" on public.app_files;
create policy "app_files_admin_update" on public.app_files for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "app_files_admin_delete" on public.app_files;
create policy "app_files_admin_delete" on public.app_files for delete to authenticated using (public.is_admin());

insert into storage.buckets (id,name,public) values ('app-files','app-files',true) on conflict (id) do update set public=true;

drop policy if exists "app_files_storage_public_read" on storage.objects;
create policy "app_files_storage_public_read" on storage.objects for select to anon, authenticated using (bucket_id='app-files');
drop policy if exists "app_files_storage_admin_insert" on storage.objects;
create policy "app_files_storage_admin_insert" on storage.objects for insert to authenticated with check (bucket_id='app-files' and public.is_admin());
drop policy if exists "app_files_storage_admin_update" on storage.objects;
create policy "app_files_storage_admin_update" on storage.objects for update to authenticated using (bucket_id='app-files' and public.is_admin()) with check (bucket_id='app-files' and public.is_admin());
drop policy if exists "app_files_storage_admin_delete" on storage.objects;
create policy "app_files_storage_admin_delete" on storage.objects for delete to authenticated using (bucket_id='app-files' and public.is_admin());

-- After creating your first account, promote it to admin from the SQL editor:
-- update public.profiles set role='admin' where email='karimmohammedkadry@gmail.com';
