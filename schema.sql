-- 两口子的饭桌 · Supabase 数据库结构
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴全文 → Run

create extension if not exists pgcrypto;

-- ===== 表 =====
create table if not exists households(
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists household_members(
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz default now(),
  primary key(household_id, user_id)
);

create table if not exists fridge_items(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  n text not null,          -- 食材名（中文主键）
  q numeric not null check(q >= 0),
  u text not null           -- 单位
);

create table if not exists plan_entries(
  household_id uuid not null references households(id) on delete cascade,
  day text not null,        -- 周一..周日
  meal text not null,       -- 早餐/午餐/晚餐
  dish_id text not null,
  primary key(household_id, day, meal, dish_id)
);

create table if not exists purchased_items(
  household_id uuid not null references households(id) on delete cascade,
  name text not null,       -- 已在购物清单打勾的食材
  primary key(household_id, name)
);

create table if not exists ratings(
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dish_id text not null,
  rating int not null check(rating between 1 and 5),
  primary key(household_id, user_id, dish_id)
);

create table if not exists custom_dishes(
  id text primary key,
  household_id uuid not null references households(id) on delete cascade,
  data jsonb not null,      -- {name, ja, cuisine, emoji, ingredients, steps, stepsJa, ref}
  created_by uuid references auth.users(id)
);

-- ===== 成员判定（security definer 避免 RLS 递归） =====
create or replace function is_member(hid uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists(
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- ===== RLS =====
alter table households enable row level security;
alter table household_members enable row level security;
alter table fridge_items enable row level security;
alter table plan_entries enable row level security;
alter table purchased_items enable row level security;
alter table ratings enable row level security;
alter table custom_dishes enable row level security;

drop policy if exists hh_select on households;
create policy hh_select on households for select using (is_member(id));

drop policy if exists hm_select on household_members;
create policy hm_select on household_members for select using (is_member(household_id));

-- 共享数据表：组员全权限（注意：ratings 不在此列，见下方）
do $$
declare t text;
begin
  foreach t in array array['fridge_items','plan_entries','purchased_items','custom_dishes'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all using (is_member(household_id)) with check (is_member(household_id))', t, t);
  end loop;
end $$;

-- 评分：组员可读，但只能增/改/删自己的评分（防止互相覆盖对方评分）
drop policy if exists ratings_select on ratings;
create policy ratings_select on ratings for select using (is_member(household_id));
drop policy if exists ratings_insert on ratings;
create policy ratings_insert on ratings for insert
  with check (user_id = auth.uid() and is_member(household_id));
drop policy if exists ratings_update on ratings;
create policy ratings_update on ratings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ratings_delete on ratings;
create policy ratings_delete on ratings for delete using (user_id = auth.uid());

-- ===== RPC：建组 / 加组 =====
create or replace function create_household()
returns table(household_id uuid, invite_code text)
language plpgsql security definer
set search_path = public as $$
declare code text; hid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  loop
    code := upper(translate(substr(md5(gen_random_uuid()::text),1,6),'01lo','WXYZ'));
    begin
      insert into households(invite_code) values(code) returning id into hid;
      exit;
    exception when unique_violation then end;
  end loop;
  insert into household_members(household_id, user_id) values(hid, auth.uid());
  return query select hid, code;
end $$;

create or replace function join_household(code text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare hid uuid; cnt int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into hid from households where households.invite_code = upper(trim(code));
  if hid is null then raise exception 'invalid_code'; end if;
  select count(*) into cnt from household_members where household_id = hid;
  if cnt >= 2 and not exists(
    select 1 from household_members where household_id = hid and user_id = auth.uid()
  ) then raise exception 'household_full'; end if;
  insert into household_members(household_id, user_id) values(hid, auth.uid())
    on conflict do nothing;
  return hid;
end $$;

create or replace function my_household()
returns table(household_id uuid, invite_code text, member_count bigint)
language sql security definer stable
set search_path = public as $$
  select h.id, h.invite_code,
    (select count(*) from household_members m2 where m2.household_id = h.id)
  from households h
  join household_members m on m.household_id = h.id
  where m.user_id = auth.uid()
  limit 1;
$$;

-- ===== Realtime =====
alter publication supabase_realtime add table fridge_items;
alter publication supabase_realtime add table plan_entries;
alter publication supabase_realtime add table purchased_items;
alter publication supabase_realtime add table ratings;
alter publication supabase_realtime add table custom_dishes;
