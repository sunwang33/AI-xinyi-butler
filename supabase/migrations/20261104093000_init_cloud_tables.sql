-- M12 T54：7 张上云表的首版云端 DDL（data-model.md 1.2 / 7.1–7.3）。
--
-- 与 rnapp/src/data/migrations/001_init.ts 的本机 SQLite 表一一对应：
--   persons、anniversaries、traits、content_snapshots、card_states、favorites、sent_records。
-- 不上云的 4 张表（app_settings、person_reminder_settings、festival_settings、notification_log）
-- 不在本迁移内。
--
-- 口径（G-A6 2026-11-04）：
-- - 每表 user_id NOT NULL REFERENCES auth.users，ON DELETE CASCADE（注销账号连带清数据）；
-- - 业务表之间（person_id 等）不建物理外键：跨表归属由应用层 Repository 保证，
--   首登合并可任意顺序批量上传；删除人员走应用层级联“软删”（deleted=true + 刷新 updated_at），
--   不依赖物理外键级联；
-- - deleted 为 boolean 软删标记，同步时用它传播删除（对端收到后物理清本机缓存行）；
-- - 枚举列 CHECK 取值与本机完全一致（含中文关系值），JSON 列用 jsonb，时间戳用 timestamptz；
-- - 所有组合索引以 user_id 领先，配合 RLS 按用户过滤；
-- - 可空外键的唯一约束沿用 COALESCE 表达式索引（与 SQLite 同构，见 data-model 7.2）。
--
-- T56 实现注意：首登静默合并批量上传历史行时，INSERT 必须显式带上行内原有的
-- created_at / updated_at，否则会被 default now() 覆盖成上传时刻，破坏 updated_at 新者胜比较；
-- 之后每次 UPDATE 的 updated_at 由触发器以服务器时钟刷新（比客户端时钟可信，曾用改设备日期调试），
-- 拉取侧以服务端回传的 updated_at 回写本机。

create extension if not exists pgcrypto;

-- ============ 通用：updated_at 自动刷新 ============

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ 1) persons 人员档案 ============

create table if not exists public.persons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  relation       text not null check (relation in ('家人', '挚友', '客户', '其他')),
  birthday_month smallint not null check (birthday_month between 1 and 12),
  birthday_day   smallint not null check (birthday_day between 1 and 31),
  birth_year     integer,
  salutation     text,
  signature      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);

drop trigger if exists trg_persons_updated_at on public.persons;
create trigger trg_persons_updated_at
  before update on public.persons
  for each row execute function public.set_updated_at();

-- ============ 2) anniversaries 纪念日 ============

create table if not exists public.anniversaries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   uuid not null,
  name        text not null,
  month       smallint not null check (month between 1 and 12),
  day         smallint not null check (day between 1 and 31),
  start_year  integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists idx_anniversaries_user_person
  on public.anniversaries (user_id, person_id);

drop trigger if exists trg_anniversaries_updated_at on public.anniversaries;
create trigger trg_anniversaries_updated_at
  before update on public.anniversaries
  for each row execute function public.set_updated_at();

-- ============ 3) traits 特征 ============

create table if not exists public.traits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   uuid not null,
  content     text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists idx_traits_user_person_position
  on public.traits (user_id, person_id, position);

drop trigger if exists trg_traits_updated_at on public.traits;
create trigger trg_traits_updated_at
  before update on public.traits
  for each row execute function public.set_updated_at();

-- ============ 4) content_snapshots 祝福/礼物当年快照 ============

create table if not exists public.content_snapshots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid,
  occasion_type  text not null check (occasion_type in ('birthday', 'anniversary', 'festival')),
  anniversary_id uuid,
  festival_code  text
                   check (festival_code is null
                     or festival_code in
                       ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year           integer not null,
  blessings      jsonb,
  gifts          jsonb,
  status         text not null default 'pending'
                   check (status in ('pending', 'success', 'failed')),
  fail_count     integer not null default 0,
  generated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);
-- 人（可空，通用节日）× 日子 × 年份唯一；user_id 领先保证不同用户的通用版互不冲突
create unique index if not exists ux_snapshot_occasion on public.content_snapshots (
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(person_id, '00000000-0000-0000-0000-000000000000'),
  occasion_type,
  coalesce(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(festival_code, ''),
  year
);
create index if not exists idx_snapshots_user_person_year
  on public.content_snapshots (user_id, person_id, occasion_type, year);
create index if not exists idx_snapshots_user_status
  on public.content_snapshots (user_id, status);

drop trigger if exists trg_content_snapshots_updated_at on public.content_snapshots;
create trigger trg_content_snapshots_updated_at
  before update on public.content_snapshots
  for each row execute function public.set_updated_at();

-- ============ 5) card_states 贺卡组合状态 ============

create table if not exists public.card_states (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid,
  occasion_type  text not null check (occasion_type in ('birthday', 'anniversary', 'festival')),
  anniversary_id uuid,
  festival_code  text
                   check (festival_code is null
                     or festival_code in
                       ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year           integer not null,
  template_code  text not null,
  selected_index integer not null default 0,
  edited_text    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);
create unique index if not exists ux_card_state_occasion on public.card_states (
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(person_id, '00000000-0000-0000-0000-000000000000'),
  occasion_type,
  coalesce(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(festival_code, ''),
  year
);
create index if not exists idx_card_states_user_person_year
  on public.card_states (user_id, person_id, occasion_type, year);

drop trigger if exists trg_card_states_updated_at on public.card_states;
create trigger trg_card_states_updated_at
  before update on public.card_states
  for each row execute function public.set_updated_at();

-- ============ 6) favorites 收藏 ============

create table if not exists public.favorites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('blessing', 'gift', 'card')),
  person_id      uuid,
  person_label   text,
  occasion_type  text not null check (occasion_type in ('birthday', 'anniversary', 'festival')),
  anniversary_id uuid,
  festival_code  text
                   check (festival_code is null
                     or festival_code in
                       ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  occasion_name  text not null,
  year           integer not null,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);
-- G-A5：去重在应用层按指纹判定，库内不设内容唯一约束；列表按收藏时间倒序
create index if not exists idx_favorites_user_kind_created
  on public.favorites (user_id, kind, created_at desc);
create index if not exists idx_favorites_user_person
  on public.favorites (user_id, person_id);

drop trigger if exists trg_favorites_updated_at on public.favorites;
create trigger trg_favorites_updated_at
  before update on public.favorites
  for each row execute function public.set_updated_at();

-- ============ 7) sent_records 已送出/往年记录 ============

create table if not exists public.sent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid not null,
  occasion_type  text not null check (occasion_type in ('birthday', 'anniversary', 'festival')),
  anniversary_id uuid,
  festival_code  text
                   check (festival_code is null
                     or festival_code in
                       ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year           integer not null,
  kind           text not null check (kind in ('blessing', 'gift', 'card')),
  payload        jsonb not null,
  marked_at      timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);
-- G-A4 业务唯一：用户 × 人 × 日子 × 年 × 分条种类
create unique index if not exists ux_sent_record on public.sent_records (
  user_id,
  person_id,
  occasion_type,
  coalesce(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(festival_code, ''),
  year desc,
  kind
);
-- 往年区按年份倒序读取
create index if not exists idx_sent_user_person_year
  on public.sent_records (
    user_id, person_id, occasion_type,
    coalesce(anniversary_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(festival_code, ''),
    year desc
  );

drop trigger if exists trg_sent_records_updated_at on public.sent_records;
create trigger trg_sent_records_updated_at
  before update on public.sent_records
  for each row execute function public.set_updated_at();

-- ============ RLS：仅本人可读写本行（data-model 7.3） ============

alter table public.persons enable row level security;
alter table public.anniversaries enable row level security;
alter table public.traits enable row level security;
alter table public.content_snapshots enable row level security;
alter table public.card_states enable row level security;
alter table public.favorites enable row level security;
alter table public.sent_records enable row level security;

do $$
declare
  t text;
  cloud_tables text[] := array[
    'persons', 'anniversaries', 'traits', 'content_snapshots',
    'card_states', 'favorites', 'sent_records'
  ];
begin
  foreach t in array cloud_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete_own', t
    );
  end loop;
end;
$$;
