-- Antlers Inventory — initial schema
-- Roles: owner (fixed emails in owner_emails), manager, user (read-only).
-- Weeks start Monday, Colorado time (America/Denver).

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table public.owner_emails (
  email text primary key check (email = lower(email))
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role text not null default 'user' check (role in ('owner', 'manager', 'user')),
  created_at timestamptz not null default now()
);

create table public.invites (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('manager', 'user')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id bigint generated always as identity primary key,
  area text not null check (area in ('bar', 'floor')),
  name text not null,
  sort_order int not null default 0
);

create table public.items (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories (id) on delete cascade,
  name text not null,
  unit text not null default 'bottle',
  have numeric(10, 2) not null default 0 check (have >= 0),
  need numeric(10, 2) not null default 0 check (need >= 0),
  sort_order int not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index items_category_idx on public.items (category_id, sort_order);

create table public.weekly_counts (
  week_start date not null,
  area text not null check (area in ('bar', 'floor')),
  finished_by uuid references public.profiles (id) on delete set null,
  finished_at timestamptz not null default now(),
  primary key (week_start, area)
);

create table public.weekly_orders (
  id bigint generated always as identity primary key,
  week_start date not null,
  item_id bigint references public.items (id) on delete set null,
  item_name text not null,
  unit text not null,
  qty numeric(10, 2) not null,
  ordered_by uuid references public.profiles (id) on delete set null,
  ordered_at timestamptz not null default now()
);
create index weekly_orders_week_idx on public.weekly_orders (week_start);

create table public.item_changes (
  id bigint generated always as identity primary key,
  item_id bigint references public.items (id) on delete set null,
  item_name text not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index item_changes_time_idx on public.item_changes (changed_at desc);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────

create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_owner() returns boolean
language sql stable as $$ select coalesce(public.my_role() = 'owner', false) $$;

create function public.is_editor() returns boolean
language sql stable as $$ select coalesce(public.my_role() in ('owner', 'manager'), false) $$;

create function public.is_member() returns boolean
language sql stable as $$ select public.my_role() is not null $$;

-- Monday of the current week in Colorado time
create function public.current_week_start() returns date
language sql stable as $$
  select date_trunc('week', now() at time zone 'America/Denver')::date
$$;

-- ─────────────────────────────────────────────────────────────
-- Profiles: created when an auth user is created (invite or dashboard)
-- ─────────────────────────────────────────────────────────────

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  if exists (select 1 from public.owner_emails where email = lower(new.email)) then
    r := 'owner';
  else
    select role into r from public.invites where email = lower(new.email);
    r := coalesce(r, 'user');
  end if;

  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    r
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Adding an owner email later promotes an existing account
create function public.handle_owner_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'owner' where email = new.email;
  return new;
end $$;

create trigger on_owner_email_added
  after insert on public.owner_emails
  for each row execute function public.handle_owner_email();

-- Only owners change roles, and the owner role itself is fixed
create function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Profile id and email cannot be changed';
  end if;
  if new.role <> old.role and auth.uid() is not null then
    if not public.is_owner() then
      raise exception 'Only an owner can change roles';
    end if;
    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'The owner role is fixed';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ─────────────────────────────────────────────────────────────
-- Items: stamp editor + log every change
-- ─────────────────────────────────────────────────────────────

create function public.stamp_item() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create trigger items_stamp
  before insert or update on public.items
  for each row execute function public.stamp_item();

create function public.log_item_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then return null; end if;  -- skip seed / dashboard imports
    insert into public.item_changes (item_id, item_name, field, new_value, changed_by)
    values (new.id, new.name, 'created', new.name, auth.uid());
  elsif tg_op = 'DELETE' then
    insert into public.item_changes (item_id, item_name, field, old_value, changed_by)
    values (null, old.name, 'deleted', old.name, auth.uid());
  else
    if new.have is distinct from old.have then
      insert into public.item_changes (item_id, item_name, field, old_value, new_value, changed_by)
      values (new.id, new.name, 'have', old.have::text, new.have::text, auth.uid());
    end if;
    if new.need is distinct from old.need then
      insert into public.item_changes (item_id, item_name, field, old_value, new_value, changed_by)
      values (new.id, new.name, 'need', old.need::text, new.need::text, auth.uid());
    end if;
    if new.name is distinct from old.name then
      insert into public.item_changes (item_id, item_name, field, old_value, new_value, changed_by)
      values (new.id, new.name, 'name', old.name, new.name, auth.uid());
    end if;
  end if;
  return null;
end $$;

create trigger items_log
  after insert or update or delete on public.items
  for each row execute function public.log_item_change();

-- ─────────────────────────────────────────────────────────────
-- Actions the app calls
-- ─────────────────────────────────────────────────────────────

-- Tick an item as ordered: save this week's order and reset Need to 0 (Have is untouched)
create function public.mark_ordered(p_item_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  it public.items;
begin
  if not public.is_editor() then
    raise exception 'Only owners and managers can mark items ordered';
  end if;

  select * into it from public.items where id = p_item_id for update;
  if not found or it.need <= 0 then
    raise exception 'Nothing to order for this item';
  end if;

  insert into public.weekly_orders (week_start, item_id, item_name, unit, qty, ordered_by)
  values (public.current_week_start(), it.id, it.name, it.unit, it.need, auth.uid());

  update public.items set need = 0 where id = p_item_id;
end $$;

-- Mark the Bar or Floor count finished for this week
create function public.finish_count(p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_editor() then
    raise exception 'Only owners and managers can finish a count';
  end if;
  insert into public.weekly_counts (week_start, area, finished_by, finished_at)
  values (public.current_week_start(), p_area, auth.uid(), now())
  on conflict (week_start, area)
  do update set finished_by = excluded.finished_by, finished_at = excluded.finished_at;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────

alter table public.owner_emails enable row level security;   -- no policies: dashboard / service role only
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.weekly_counts enable row level security;
alter table public.weekly_orders enable row level security;
alter table public.item_changes enable row level security;
alter table public.push_tokens enable row level security;

create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
create policy "self or owner updates profile" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_owner());

create policy "owners read invites" on public.invites
  for select to authenticated using (public.is_owner());

create policy "members read categories" on public.categories
  for select to authenticated using (public.is_member());
create policy "editors write categories" on public.categories
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

create policy "members read items" on public.items
  for select to authenticated using (public.is_member());
create policy "editors write items" on public.items
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

create policy "members read weekly counts" on public.weekly_counts
  for select to authenticated using (public.is_member());

create policy "members read weekly orders" on public.weekly_orders
  for select to authenticated using (public.is_member());

create policy "editors read change log" on public.item_changes
  for select to authenticated using (public.is_editor());

create policy "own push tokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Live updates
-- ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.items, public.weekly_counts, public.weekly_orders;
