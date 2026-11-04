/**
 * 流水聚合与行文案纯函数单测（M11 T69）。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import type { SentRecord, SentTimelineRow } from '../../data/entities';
import { FESTIVALS } from '../occasions/festivals';
import {
  groupSentTimeline,
  monthDayOf,
  occasionNameOf,
  stampDayOf,
  timelineSubtitle,
  timelineTitle,
} from './timeline';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

/** 造一条 sent_records 测试记录，仅覆盖关心字段 */
function makeRecord(partial: Partial<SentRecord> & Pick<SentRecord, 'kind' | 'year' | 'markedAt'>): SentRecord {
  return {
    id: 's1',
    personId: 'p1',
    occasionType: 'birthday',
    anniversaryId: null,
    festivalCode: null,
    payload: { text: '甲' },
    userId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deleted: false,
    ...partial,
  } as SentRecord;
}

/** 造流水扁平行 */
function makeRow(record: SentRecord, extra?: Partial<Omit<SentTimelineRow, 'record'>>): SentTimelineRow {
  return {
    personName: '陈叔',
    personSalutation: null,
    relation: '其他',
    anniversaryName: null,
    record,
    ...extra,
  };
}

describe('occasionNameOf', () => {
  it('生日固定「生日」；纪念日取 join 的档案名；节日取常量表名', () => {
    const festival = FESTIVALS[0];
    expect(
      occasionNameOf(makeRow(makeRecord({ kind: 'blessing', year: 2026, markedAt: '2026-11-03T00:00:00.000Z' }))),
    ).toBe('生日');
    expect(
      occasionNameOf(
        makeRow(
          makeRecord({
            kind: 'blessing',
            year: 2026,
            occasionType: 'anniversary',
            anniversaryId: 'a1',
            markedAt: '2026-11-03T00:00:00.000Z',
          }),
          { anniversaryName: '领证日' },
        ),
      ),
    ).toBe('领证日');
    expect(
      occasionNameOf(
        makeRow(
          makeRecord({
            kind: 'blessing',
            year: 2026,
            occasionType: 'festival',
            festivalCode: festival.code,
            markedAt: '2026-11-03T00:00:00.000Z',
          }),
        ),
      ),
    ).toBe(festival.name);
  });
});

describe('groupSentTimeline（G-A4 分条存储、聚合展示）', () => {
  it('同人同日子同年的三类记录聚合成一组；lastMarkedAt 取最新', () => {
    const base = { personId: 'p1', occasionType: 'birthday' as const, year: 2026 };
    const rows = [
      makeRow(makeRecord({ ...base, id: 'gift', kind: 'gift', markedAt: '2026-10-27T08:00:00.000Z', payload: { name: '礼', reason: '', search_term: '' } })),
      makeRow(makeRecord({ ...base, id: 'blessing-late', kind: 'blessing', markedAt: '2026-10-28T10:00:00.000Z', payload: { text: '祝' } })),
    ];
    const groups = groupSentTimeline(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((r) => r.id)).toEqual(['blessing-late', 'gift']);
    expect(groups[0].lastMarkedAt).toBe('2026-10-28T10:00:00.000Z');
  });

  it('不同人 / 不同年份 / 不同日子拆组，组按最新标记时间倒序', () => {
    const rows = [
      // 老王 2025 生日（较早）
      makeRow(
        makeRecord({ id: 'old', personId: 'p2', kind: 'blessing', year: 2025, markedAt: '2025-05-09T00:00:00.000Z', payload: { text: '旧' } }),
        { personName: '老王' },
      ),
      // 陈叔 2026 生日两条（较晚）
      makeRow(makeRecord({ id: 'new1', personId: 'p1', kind: 'blessing', year: 2026, markedAt: '2026-10-28T09:00:00.000Z', payload: { text: '新' } })),
      makeRow(makeRecord({ id: 'new2', personId: 'p1', kind: 'card', year: 2026, markedAt: '2026-10-28T11:00:00.000Z', payload: { template_code: 'warm', salutation: '', text: '', signature: null, occasion_type: 'birthday', occasion_name: '生日' } })),
      // 陈叔 2026 母亲节：同人同年但不同日子，应拆组
      makeRow(
        makeRecord({
          id: 'fest',
          personId: 'p1',
          occasionType: 'festival',
          festivalCode: FESTIVALS[0].code,
          kind: 'gift',
          year: 2026,
          markedAt: '2026-05-10T00:00:00.000Z',
          payload: { name: '花', reason: '', search_term: '' },
        }),
      ),
    ];
    const groups = groupSentTimeline(rows);
    expect(groups).toHaveLength(3);
    // 陈叔生日（10 月）在最前；老王 2025 与陈叔母亲节（5 月）按时间排后
    expect(groups[0].personId).toBe('p1');
    expect(groups[0].occasionType).toBe('birthday');
    expect(groups[0].records).toHaveLength(2);
    expect(groups[1].lastMarkedAt < groups[0].lastMarkedAt).toBe(true);
    expect(groups[2].lastMarkedAt < groups[1].lastMarkedAt).toBe(true);
  });

  it('输入乱序不影响组排序', () => {
    const rows = [
      makeRow(makeRecord({ id: 'a', personId: 'p9', kind: 'blessing', year: 2024, markedAt: '2024-01-01T00:00:00.000Z', payload: { text: '早' } })),
      makeRow(makeRecord({ id: 'b', kind: 'blessing', year: 2026, markedAt: '2026-11-03T00:00:00.000Z', payload: { text: '晚' } })),
    ];
    expect(groupSentTimeline(rows).map((g) => g.year)).toEqual([2026, 2024]);
  });
});

describe('流水行文案', () => {
  it('标题：生日 / 纪念日用「谁的日子」，节日用「谁 · 日子」，称呼优先', () => {
    const birthday = groupSentTimeline([
      makeRow(makeRecord({ id: '1', kind: 'blessing', year: 2025, markedAt: '2025-12-01T00:00:00.000Z', payload: { text: '甲' } }), { personName: '张伟' }),
    ])[0];
    expect(timelineTitle(birthday)).toBe('张伟的生日');

    const withSalutation = { ...birthday, personSalutation: '老张' };
    expect(timelineTitle(withSalutation)).toBe('老张的生日');

    const anniversary = groupSentTimeline([
      makeRow(
        makeRecord({ id: '2', occasionType: 'anniversary', anniversaryId: 'a1', kind: 'blessing', year: 2026, markedAt: '2026-11-03T00:00:00.000Z', payload: { text: '甲' } }),
        { personName: '妈妈', personSalutation: '妈', anniversaryName: '领证日' },
      ),
    ])[0];
    expect(timelineTitle(anniversary)).toBe('妈的领证日');

    const festival = groupSentTimeline([
      makeRow(
        makeRecord({ id: '3', occasionType: 'festival', festivalCode: FESTIVALS[0].code, kind: 'blessing', year: 2026, markedAt: '2026-11-03T00:00:00.000Z', payload: { text: '甲' } }),
        { personName: '王兰', personSalutation: '妈妈' },
      ),
    ])[0];
    expect(timelineTitle(festival)).toBe(`妈妈 · ${FESTIVALS[0].name}`);
  });

  it('副行：日期＋实际送出种类，种类固定祝福 / 礼物 / 贺卡顺序；邮戳取「日」', () => {
    const group = groupSentTimeline([
      makeRow(makeRecord({ id: 'c', kind: 'card', year: 2026, markedAt: '2026-10-28T11:00:00.000Z', payload: { template_code: 'warm', salutation: '', text: '', signature: null, occasion_type: 'birthday', occasion_name: '生日' } })),
      makeRow(makeRecord({ id: 'b', kind: 'blessing', year: 2026, markedAt: '2026-10-28T09:00:00.000Z', payload: { text: '祝' } })),
    ])[0];
    expect(timelineSubtitle(group)).toBe('10月28日送出 · 祝福 · 贺卡');
    expect(stampDayOf(group.lastMarkedAt)).toBe(28);
    expect(monthDayOf('不是日期')).toBeNull();
    expect(stampDayOf('不是日期')).toBeNull();
  });
});
