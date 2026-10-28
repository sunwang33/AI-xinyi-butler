/**
 * 初始迁移（T06）：data-model.md 第 2、5、7.2 节的首版 DDL。
 *
 * 11 张表：persons、anniversaries、traits、app_settings、person_reminder_settings、
 * festival_settings、content_snapshots、card_states、favorites、sent_records、notification_log。
 *
 * 约定：
 * - 主键 UUID 由应用层生成（TEXT）；布尔为 INTEGER 0/1；JSON 为 TEXT；时间戳为 ISO 字符串；
 * - 7 张上云表预留 user_id（本机 NULL）、created_at、updated_at、deleted，与阶段 12 的
 *   Postgres DDL 尽量同构；4 张仅本机表不带 user_id（notification_log 连 deleted 也没有）；
 * - 枚举列在本机即加 CHECK（data-model 1.3、7.1 节），防止脏数据；
 * - 可空外键的唯一约束用 COALESCE 表达式索引（7.2 节），SQLite 与 Postgres 写法同构；
 * - 删除人员由 Repository 在事务内显式物理级联（spec 第 2 条），外键 ON DELETE CASCADE
 *   仅作兜底；节日为代码常量，festival_code 不建实体外键。
 */
import type { Migration } from './types';

const DDL = `
CREATE TABLE persons (
  id              TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  relation        TEXT NOT NULL CHECK (relation IN ('家人', '挚友', '客户', '其他')),
  birthday_month  INTEGER NOT NULL CHECK (birthday_month BETWEEN 1 AND 12),
  birthday_day    INTEGER NOT NULL CHECK (birthday_day BETWEEN 1 AND 31),
  birth_year      INTEGER,
  salutation      TEXT,
  signature       TEXT,
  user_id         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

CREATE TABLE anniversaries (
  id          TEXT PRIMARY KEY NOT NULL,
  person_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  start_year  INTEGER,
  user_id     TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX idx_anniversaries_person ON anniversaries (person_id);

CREATE TABLE traits (
  id          TEXT PRIMARY KEY NOT NULL,
  person_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  user_id     TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX idx_traits_person_position ON traits (person_id, position);

-- 本机单行表：固定 id = 1，默认「提前三天、上午 9:00、祝福三条、AI 告知未表态」
CREATE TABLE app_settings (
  id                    INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  global_advance_days   INTEGER NOT NULL DEFAULT 3 CHECK (global_advance_days BETWEEN 1 AND 30),
  delivery_hour         INTEGER NOT NULL DEFAULT 9 CHECK (delivery_hour BETWEEN 0 AND 23),
  blessing_count        INTEGER NOT NULL DEFAULT 3,
  ai_consent            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (ai_consent IN ('pending', 'agreed', 'declined'))
);

CREATE TABLE person_reminder_settings (
  person_id     TEXT PRIMARY KEY NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  advance_days  INTEGER CHECK (advance_days IS NULL OR advance_days BETWEEN 1 AND 30),
  disabled      INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
);

CREATE TABLE festival_settings (
  festival_code TEXT PRIMARY KEY NOT NULL
                  CHECK (festival_code IN
                    ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  disabled      INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
);

CREATE TABLE content_snapshots (
  id              TEXT PRIMARY KEY NOT NULL,
  person_id       TEXT REFERENCES persons(id) ON DELETE CASCADE,
  occasion_type   TEXT NOT NULL CHECK (occasion_type IN ('birthday', 'anniversary', 'festival')),
  anniversary_id  TEXT REFERENCES anniversaries(id) ON DELETE CASCADE,
  festival_code   TEXT
                    CHECK (festival_code IS NULL
                      OR festival_code IN
                        ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year            INTEGER NOT NULL,
  blessings       TEXT,
  gifts           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'failed')),
  fail_count      INTEGER NOT NULL DEFAULT 0,
  generated_at    TEXT,
  user_id         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
-- 「人 × 日子 × 年份」唯一（7.2 节 COALESCE 表达式索引）；user_id 领先，与云端同构
CREATE UNIQUE INDEX ux_snapshot_occasion ON content_snapshots (
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(person_id, '00000000-0000-0000-0000-000000000000'),
  occasion_type,
  COALESCE(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(festival_code, ''),
  year
);
CREATE INDEX idx_snapshots_person_year ON content_snapshots (person_id, occasion_type, year);
CREATE INDEX idx_snapshots_status ON content_snapshots (status);

CREATE TABLE card_states (
  id              TEXT PRIMARY KEY NOT NULL,
  person_id       TEXT REFERENCES persons(id) ON DELETE CASCADE,
  occasion_type   TEXT NOT NULL CHECK (occasion_type IN ('birthday', 'anniversary', 'festival')),
  anniversary_id  TEXT REFERENCES anniversaries(id) ON DELETE CASCADE,
  festival_code   TEXT
                    CHECK (festival_code IS NULL
                      OR festival_code IN
                        ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year            INTEGER NOT NULL,
  template_code   TEXT NOT NULL,
  selected_index  INTEGER NOT NULL DEFAULT 0,
  edited_text     TEXT,
  user_id         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE UNIQUE INDEX ux_card_state_occasion ON card_states (
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(person_id, '00000000-0000-0000-0000-000000000000'),
  occasion_type,
  COALESCE(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(festival_code, ''),
  year
);
CREATE INDEX idx_card_states_person_year ON card_states (person_id, occasion_type, year);

CREATE TABLE favorites (
  id              TEXT PRIMARY KEY NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('blessing', 'gift', 'card')),
  person_id       TEXT REFERENCES persons(id) ON DELETE CASCADE,
  person_label    TEXT,
  occasion_type   TEXT NOT NULL CHECK (occasion_type IN ('birthday', 'anniversary', 'festival')),
  anniversary_id  TEXT REFERENCES anniversaries(id) ON DELETE CASCADE,
  festival_code   TEXT
                    CHECK (festival_code IS NULL
                      OR festival_code IN
                        ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  occasion_name   TEXT NOT NULL,
  year            INTEGER NOT NULL,
  payload         TEXT NOT NULL,
  user_id         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
-- 去重/排序规则随 B 组门禁拍板，故除 created_at 外不预设唯一约束
CREATE INDEX idx_favorites_kind_created ON favorites (kind, created_at);
CREATE INDEX idx_favorites_person ON favorites (person_id);

CREATE TABLE sent_records (
  id              TEXT PRIMARY KEY NOT NULL,
  person_id       TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  occasion_type   TEXT NOT NULL CHECK (occasion_type IN ('birthday', 'anniversary', 'festival')),
  anniversary_id  TEXT REFERENCES anniversaries(id) ON DELETE CASCADE,
  festival_code   TEXT
                    CHECK (festival_code IS NULL
                      OR festival_code IN
                        ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year            INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('blessing', 'gift', 'card')),
  payload         TEXT NOT NULL,
  marked_at       TEXT NOT NULL,
  user_id         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
-- 初步唯一（5.1 节，随门禁 A4 定稿）；year DESC 同时服务往年记录按年份倒序读取
CREATE UNIQUE INDEX ux_sent_record ON sent_records (
  person_id,
  occasion_type,
  COALESCE(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(festival_code, ''),
  year DESC,
  kind
);

-- 纯本机运行数据：无 user_id、无 deleted
CREATE TABLE notification_log (
  id                 TEXT PRIMARY KEY NOT NULL,
  occasion_type      TEXT NOT NULL CHECK (occasion_type IN ('birthday', 'anniversary', 'festival')),
  person_id          TEXT REFERENCES persons(id) ON DELETE CASCADE,
  anniversary_id     TEXT REFERENCES anniversaries(id) ON DELETE CASCADE,
  festival_code      TEXT
                       CHECK (festival_code IS NULL
                         OR festival_code IN
                           ('new_year', 'valentines_day', 'mothers_day', 'fathers_day', 'thanksgiving', 'christmas')),
  year               INTEGER NOT NULL,
  scheduled_at       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'delivered', 'made_up')),
  is_made_up         INTEGER NOT NULL DEFAULT 0 CHECK (is_made_up IN (0, 1)),
  os_notification_id TEXT,
  delivered_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
-- 「日子 × 年份」唯一（7.2 节：notification_log 不带 user_id）
CREATE UNIQUE INDEX ux_notification_log_occasion ON notification_log (
  COALESCE(person_id, '00000000-0000-0000-0000-000000000000'),
  occasion_type,
  COALESCE(anniversary_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(festival_code, ''),
  year
);
CREATE INDEX idx_notification_status_scheduled ON notification_log (status, scheduled_at);

-- 默认数据：设置单行
INSERT INTO app_settings (id, global_advance_days, delivery_hour, blessing_count, ai_consent)
VALUES (1, 3, 9, 3, 'pending');

-- 默认数据：六个内置节日开关，全部开启（顺序即 data-model 1.3 节顺序）
INSERT INTO festival_settings (festival_code, disabled) VALUES
  ('new_year', 0),
  ('valentines_day', 0),
  ('mothers_day', 0),
  ('fathers_day', 0),
  ('thanksgiving', 0),
  ('christmas', 0);
`;

const migration001: Migration = {
  version: 1,
  name: 'init',
  async up(exec) {
    await exec.execAsync(DDL);
  },
};

export default migration001;
