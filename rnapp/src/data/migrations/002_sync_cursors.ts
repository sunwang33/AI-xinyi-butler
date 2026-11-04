/**
 * 迁移 002（M12 T56）：云同步水位表（仅本机，不上云）。
 *
 * 记录「某账号 × 某上云表」最近一次成功增量拉取的服务端时间，
 * sync.ts 下次只拉 updated_at 晚于该水位的行（含软删行）。
 *
 * 设计：
 * - 纯本机运行状态，故不带云端七表那套 user_id 预留/deleted 约定；
 *   但水位必须按账号区分（同一设备可能退出后换号登录），故 user_id 作为主键的一部分；
 * - 退出登录选「清除本机缓存」时同步删除该账号的全部水位行，
 *   重登后首次拉取退化为全量，保证数据完整恢复（G-A6）。
 */
import type { Migration } from './types';

const DDL = `
CREATE TABLE sync_cursors (
  user_id        TEXT NOT NULL,
  table_name     TEXT NOT NULL,
  last_pulled_at TEXT NOT NULL,
  PRIMARY KEY (user_id, table_name)
);
`;

const migration002: Migration = {
  version: 2,
  name: 'sync_cursors',
  async up(exec) {
    await exec.execAsync(DDL);
  },
};

export default migration002;
