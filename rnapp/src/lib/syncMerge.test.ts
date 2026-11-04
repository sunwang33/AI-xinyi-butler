/**
 * 云同步「新者胜」裁决纯函数单测（T56 / G-A6，T77 数据层测试的一部分）。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import {
  CLOUD_TABLES,
  isRemoteNewer,
  shouldApplyRemoteRow,
  shouldUploadLocalRow,
} from './syncMerge';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';

describe('CLOUD_TABLES', () => {
  it('固定为七张上云表且 persons 在前（首登合并先传主行）', () => {
    expect([...CLOUD_TABLES]).toEqual([
      'persons',
      'anniversaries',
      'traits',
      'content_snapshots',
      'card_states',
      'favorites',
      'sent_records',
    ]);
  });
});

describe('isRemoteNewer（updated_at 严格新者胜）', () => {
  it('远端晚于本机为 true', () => {
    expect(isRemoteNewer(T1, T2)).toBe(true);
  });
  it('远端早于本机为 false', () => {
    expect(isRemoteNewer(T2, T1)).toBe(false);
  });
  it('时间戳相等为 false（保留本机，减少无谓写入）', () => {
    expect(isRemoteNewer(T1, T1)).toBe(false);
  });
  it('远端时间戳非法时不敢覆盖本机，为 false', () => {
    expect(isRemoteNewer(T1, 'not-a-date')).toBe(false);
  });
  it('本机时间戳非法而远端合法时，远端胜出', () => {
    expect(isRemoteNewer('bad', T2)).toBe(true);
  });
});

describe('shouldUploadLocalRow（首登静默合并：本机匿名行是否上传）', () => {
  const local = { id: 'a', updatedAt: T1 };
  it('云端无同 id 行：上传（异端独有直接并入）', () => {
    expect(shouldUploadLocalRow(local, null)).toBe(true);
  });
  it('本机比云端新：上传覆盖', () => {
    expect(shouldUploadLocalRow({ id: 'a', updatedAt: T2 }, { id: 'a', updatedAt: T1 })).toBe(true);
  });
  it('云端比本机新：不上传，交给 pull 带回', () => {
    expect(shouldUploadLocalRow(local, { id: 'a', updatedAt: T2 })).toBe(false);
  });
  it('时间戳相等：不上传', () => {
    expect(shouldUploadLocalRow(local, { id: 'a', updatedAt: T1 })).toBe(false);
  });
});

describe('shouldApplyRemoteRow（增量拉取：云端行是否覆盖本机缓存）', () => {
  const remote = { id: 'a', updatedAt: T2 };
  it('本机无缓存行：直接应用', () => {
    expect(shouldApplyRemoteRow(null, remote)).toBe(true);
  });
  it('云端更新：覆盖本机', () => {
    expect(shouldApplyRemoteRow({ id: 'a', updatedAt: T1 }, remote)).toBe(true);
  });
  it('本机更新：不被旧云端行回退', () => {
    expect(shouldApplyRemoteRow({ id: 'a', updatedAt: T2 }, { id: 'a', updatedAt: T1 })).toBe(false);
  });
});
