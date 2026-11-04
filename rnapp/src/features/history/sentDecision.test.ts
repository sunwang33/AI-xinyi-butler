/**
 * 「已送出」标记判定单测（M11 T50）。重点：
 * - 该年该种类无记录 → add；
 * - 有记录且内容指纹相同（含空白差异）→ unmark（再点即撤销）；
 * - 有记录但内容变了（重新生成 / 换版本）→ replace（需确认后 upsert 更改）；
 * - 年份与 kind 互相隔离：别的年 / 别的种类不影响判定。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import type { SentRecord } from '../../data/entities';
import { decideSentAction, findYearKind, groupPastYears } from './sentDecision';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

/** 构造已送出记录测试夹具，仅覆盖关心的字段 */
function makeRecord(
  partial: Pick<SentRecord, 'kind' | 'payload' | 'year'> & Partial<SentRecord>,
): SentRecord {
  return {
    id: 's1',
    personId: 'p1',
    occasionType: 'birthday',
    anniversaryId: null,
    festivalCode: null,
    markedAt: '2026-11-03T10:00:00.000Z',
    userId: null,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    deleted: false,
    ...partial,
  } as SentRecord;
}

describe('findYearKind', () => {
  it('同年同类命中；年份或种类不同返回 null', () => {
    const records = [
      makeRecord({ id: 'blessing-2026', kind: 'blessing', year: 2026, payload: { text: '甲' } }),
      makeRecord({ id: 'gift-2026', kind: 'gift', year: 2026, payload: { name: '礼', reason: '', search_term: '' } }),
      makeRecord({ id: 'blessing-2025', kind: 'blessing', year: 2025, payload: { text: '旧' } }),
    ];
    expect(findYearKind(records, 2026, 'blessing')?.id).toBe('blessing-2026');
    expect(findYearKind(records, 2026, 'card')).toBeNull();
    expect(findYearKind(records, 2027, 'blessing')).toBeNull();
  });
});

describe('decideSentAction（T50 标记 / 撤销 / 更改）', () => {
  it('该年该种类尚无记录：新增', () => {
    expect(decideSentAction([], 2026, 'blessing', { text: '甲' }).type).toBe('add');
  });

  it('已有记录且就是同一内容（仅空白差异）：撤销同一条', () => {
    const records = [makeRecord({ kind: 'blessing', year: 2026, payload: { text: '生日快乐' } })];
    const decision = decideSentAction(records, 2026, 'blessing', { text: ' 生日快乐\n' });
    expect(decision.type).toBe('unmark');
    if (decision.type === 'unmark') {
      expect(decision.existing.id).toBe('s1');
    }
  });

  it('已有记录但祝福文案重新生成变了：判定为更改（replace）', () => {
    const records = [makeRecord({ kind: 'blessing', year: 2026, payload: { text: '旧文案' } })];
    const decision = decideSentAction(records, 2026, 'blessing', { text: '新文案' });
    expect(decision.type).toBe('replace');
    if (decision.type === 'replace') {
      expect(decision.existing.payload).toEqual({ text: '旧文案' });
    }
  });

  it('礼物：名称 / 理由 / 搜索词任一变化即为更改', () => {
    const records = [
      makeRecord({
        kind: 'gift',
        year: 2026,
        payload: { name: '蓝牙音箱', reason: '爱音乐', search_term: '乔迁 音箱' },
      }),
    ];
    const changed = decideSentAction(records, 2026, 'gift', {
      name: '蓝牙耳机',
      reason: '爱音乐',
      search_term: '乔迁 音箱',
    });
    expect(changed.type).toBe('replace');
  });

  it('贺卡：换模板 / 改字后再标记为更改；完全相同为撤销', () => {
    const cardPayload = {
      template_code: 'warm',
      salutation: '妈',
      text: '安康',
      signature: '小明',
      occasion_type: 'birthday' as const,
      occasion_name: '生日',
    };
    const records = [makeRecord({ kind: 'card', year: 2026, payload: cardPayload })];
    expect(decideSentAction(records, 2026, 'card', { ...cardPayload, template_code: 'night' }).type).toBe(
      'replace',
    );
    expect(decideSentAction(records, 2026, 'card', { ...cardPayload, signature: null }).type).toBe(
      'replace',
    );
    expect(decideSentAction(records, 2026, 'card', { ...cardPayload, text: ' 安康 ' }).type).toBe(
      'unmark',
    );
  });

  it('年份隔离：同年同类的判定不受其它年份记录影响', () => {
    const records = [makeRecord({ kind: 'blessing', year: 2025, payload: { text: '去年的' } })];
    expect(decideSentAction(records, 2026, 'blessing', { text: '今年的' }).type).toBe('add');
    expect(decideSentAction(records, 2025, 'blessing', { text: '去年的' }).type).toBe('unmark');
  });

  it('kind 隔离：今年标过祝福不影响给贺卡做判定', () => {
    const records = [makeRecord({ kind: 'blessing', year: 2026, payload: { text: '甲' } })];
    const decision = decideSentAction(records, 2026, 'card', {
      template_code: 'mountain',
      salutation: '',
      text: '',
      signature: null,
      occasion_type: 'birthday' as const,
      occasion_name: '生日',
    });
    expect(decision.type).toBe('add');
  });
});

describe('groupPastYears（T52 按年倒序分组）', () => {
  it('排除当前年份，其余年份倒序成组', () => {
    const records = [
      makeRecord({ id: 'b26', kind: 'blessing', year: 2026, payload: { text: '今年' } }),
      makeRecord({ id: 'g25', kind: 'gift', year: 2025, payload: { name: '礼', reason: '', search_term: '' } }),
      makeRecord({ id: 'b24', kind: 'blessing', year: 2024, payload: { text: '前年' } }),
    ];
    const groups = groupPastYears(records, 2026);
    expect(groups.map((g) => g.year)).toEqual([2025, 2024]);
    expect(groups[0].records.map((r) => r.id)).toEqual(['g25']);
  });

  it('同年记录合到一组，组内按标记时间倒序', () => {
    const records = [
      makeRecord({
        id: 'b25-late',
        kind: 'blessing',
        year: 2025,
        markedAt: '2025-11-03T10:00:00.000Z',
        payload: { text: '晚标的' },
      }),
      makeRecord({
        id: 'c25-early',
        kind: 'card',
        year: 2025,
        markedAt: '2025-05-01T02:00:00.000Z',
        payload: {
          template_code: 'warm',
          salutation: '',
          text: '早标的',
          signature: null,
          occasion_type: 'birthday' as const,
          occasion_name: '生日',
        },
      }),
    ];
    const groups = groupPastYears(records, 2026);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((r) => r.id)).toEqual(['b25-late', 'c25-early']);
  });

  it('入参乱序时年份仍倒序；无往年记录返回空数组', () => {
    const shuffled = [
      makeRecord({ id: 'b23', kind: 'blessing', year: 2023, payload: { text: '三' } }),
      makeRecord({ id: 'b26', kind: 'blessing', year: 2026, payload: { text: '今' } }),
      makeRecord({ id: 'b25', kind: 'blessing', year: 2025, payload: { text: '二' } }),
    ];
    expect(groupPastYears(shuffled, 2026).map((g) => g.year)).toEqual([2025, 2023]);
    expect(groupPastYears([shuffled[1]], 2026)).toEqual([]);
  });
});
