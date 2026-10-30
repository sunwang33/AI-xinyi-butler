/**
 * 日子引擎与路由构造的单元测试（T16）。
 * 运行依赖 jest-expo（见 package.json 与 jest.config.js，由公共准备任务统一配置）；
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import { FESTIVAL_CODES } from '../../data/entities';
import type {
  Anniversary,
  FestivalCode,
  Person,
} from '../../data/entities';
import { FESTIVALS } from './festivals';
import {
  computeHitsInRange,
  listFollowedFestivals,
  listUpcoming,
  WINDOW_DAYS,
} from './engine';
import type { OccasionHit } from './engine';
import {
  buildDayListHref,
  buildFestivalSelectHref,
  buildOccasionHref,
} from './routes';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const NOW_TS = '2025-01-01T00:00:00.000Z';

/** 构造最小 Person，业务无关字段给实体默认字面量 */
function makePerson(init: {
  id?: string;
  name: string;
  birthdayMonth: number;
  birthdayDay: number;
  salutation?: string | null;
}): Person {
  return {
    id: init.id ?? init.name,
    name: init.name,
    relation: '家人',
    birthdayMonth: init.birthdayMonth,
    birthdayDay: init.birthdayDay,
    birthYear: null,
    salutation: init.salutation ?? null,
    signature: null,
    userId: null,
    createdAt: NOW_TS,
    updatedAt: NOW_TS,
    deleted: false,
  };
}

/** 构造最小 Anniversary */
function makeAnniversary(init: {
  id?: string;
  personId?: string;
  name?: string;
  month: number;
  day: number;
  startYear?: number | null;
}): Anniversary {
  return {
    id: init.id ?? init.name ?? 'a1',
    personId: init.personId ?? 'p1',
    name: init.name ?? '纪念日',
    month: init.month,
    day: init.day,
    startYear: init.startYear ?? null,
    userId: null,
    createdAt: NOW_TS,
    updatedAt: NOW_TS,
    deleted: false,
  };
}

const findByCode = (
  hits: OccasionHit[],
  code: FestivalCode,
): OccasionHit | undefined => hits.find((hit) => hit.festivalCode === code);

const findBirthday = (hits: OccasionHit[], personId: string) =>
  hits.find(
    (hit) => hit.occasionType === 'birthday' && hit.personId === personId,
  );

const findAnniversary = (hits: OccasionHit[], anniversaryId: string) =>
  hits.find(
    (hit) =>
      hit.occasionType === 'anniversary' &&
      hit.anniversaryId === anniversaryId,
  );

describe('FESTIVALS 六个内置节日常量', () => {
  it('严格六个，代号顺序与 FestivalCode 一致，中文名逐字固定', () => {
    expect(FESTIVALS).toHaveLength(6);
    expect(FESTIVALS.map((festival) => festival.code)).toEqual([
      ...FESTIVAL_CODES,
    ]);
    expect(FESTIVALS.map((festival) => festival.name)).toEqual([
      '元旦',
      '情人节',
      '母亲节',
      '父亲节',
      '感恩节',
      '圣诞节',
    ]);
  });

  it('固定日期节日 dateOf 正确：元旦 1/1、情人节 2/14、圣诞节 12/25', () => {
    expect(findByCode(
      computeHitsInRange({
        today: '2025-01-01',
        from: '2025-01-01',
        to: '2025-12-31',
        persons: [],
        anniversaries: [],
      }),
      'new_year',
    )?.date).toBe('2025-01-01');
    expect(findByCode(
      computeHitsInRange({
        today: '2025-02-01',
        from: '2025-01-01',
        to: '2025-12-31',
        persons: [],
        anniversaries: [],
      }),
      'valentines_day',
    )?.date).toBe('2025-02-14');
    expect(findByCode(
      computeHitsInRange({
        today: '2025-12-01',
        from: '2025-01-01',
        to: '2025-12-31',
        persons: [],
        anniversaries: [],
      }),
      'christmas',
    )?.date).toBe('2025-12-25');
  });
});

describe('生日 2 月 29 日平闰折算（存储不改，仅派生日期）', () => {
  const leapPerson = makePerson({
    id: 'leap',
    name: '小闰',
    birthdayMonth: 2,
    birthdayDay: 29,
  });

  it('2025 平年：2/29 生日出现在 2025-02-28', () => {
    const hits = listUpcoming('2025-02-27', [leapPerson], []);
    const birthday = findBirthday(hits, 'leap');
    expect(birthday?.date).toBe('2025-02-28');
    expect(birthday?.year).toBe(2025);
    expect(birthday?.daysFromToday).toBe(1);
  });

  it('2028 闰年：2/29 生日出现在 2028-02-29', () => {
    const hits = listUpcoming('2028-02-27', [leapPerson], []);
    const birthday = findBirthday(hits, 'leap');
    expect(birthday?.date).toBe('2028-02-29');
    expect(birthday?.year).toBe(2028);
    expect(birthday?.daysFromToday).toBe(2);
  });
});

describe('星期规则节日逐年计算', () => {
  it('2025 年：母亲节 05-11、父亲节 06-15、感恩节 11-27', () => {
    const hits = computeHitsInRange({
      today: '2025-01-01',
      from: '2025-01-01',
      to: '2025-12-31',
      persons: [],
      anniversaries: [],
    });
    expect(findByCode(hits, 'mothers_day')?.date).toBe('2025-05-11');
    expect(findByCode(hits, 'fathers_day')?.date).toBe('2025-06-15');
    expect(findByCode(hits, 'thanksgiving')?.date).toBe('2025-11-27');
  });

  it('2024 年：母亲节 05-12、父亲节 06-16、感恩节 11-28', () => {
    const hits = computeHitsInRange({
      today: '2024-01-01',
      from: '2024-01-01',
      to: '2024-12-31',
      persons: [],
      anniversaries: [],
    });
    expect(findByCode(hits, 'mothers_day')?.date).toBe('2024-05-12');
    expect(findByCode(hits, 'fathers_day')?.date).toBe('2024-06-16');
    expect(findByCode(hits, 'thanksgiving')?.date).toBe('2024-11-28');
  });
});

describe('跨年区间与年份归属', () => {
  it('2025-12-20～2026-01-10 含 2026 年元旦，hit.year=2026', () => {
    const hits = computeHitsInRange({
      today: '2025-12-20',
      from: '2025-12-20',
      to: '2026-01-10',
      persons: [],
      anniversaries: [],
    });
    const newYear = findByCode(hits, 'new_year');
    expect(newYear?.date).toBe('2026-01-01');
    expect(newYear?.year).toBe(2026);
    expect(newYear?.daysFromToday).toBe(12);

    const christmas = findByCode(hits, 'christmas');
    expect(christmas?.date).toBe('2025-12-25');
    expect(christmas?.year).toBe(2025);

    // 区间内不含 2025 年元旦
    expect(hits.filter((hit) => hit.date === '2025-01-01')).toHaveLength(0);
  });
});

describe('单日区间与周年数', () => {
  it('from=to 当天的生日与纪念日均出现；startYear 有值算周年、无值为 null', () => {
    const mom = makePerson({
      id: 'mom',
      name: '王秀兰',
      birthdayMonth: 5,
      birthdayDay: 10,
    });
    const golden = makeAnniversary({
      id: 'golden',
      personId: 'mom',
      name: '金婚',
      month: 5,
      day: 10,
      startYear: 2015,
    });
    const move = makeAnniversary({
      id: 'move',
      personId: 'mom',
      name: '乔迁',
      month: 5,
      day: 10,
      startYear: null,
    });

    const hits = computeHitsInRange({
      today: '2025-05-01',
      from: '2025-05-10',
      to: '2025-05-10',
      persons: [mom],
      anniversaries: [golden, move],
    });

    expect(findBirthday(hits, 'mom')?.date).toBe('2025-05-10');
    expect(findBirthday(hits, 'mom')?.anniversaryYears).toBeNull();
    expect(findAnniversary(hits, 'golden')?.anniversaryYears).toBe(10);
    expect(findAnniversary(hits, 'move')?.anniversaryYears).toBeNull();
    // 2025-05-10 不是六个节日之一
    expect(hits.filter((hit) => hit.occasionType === 'festival')).toHaveLength(0);
  });
});

describe('listUpcoming 窗口与 daysFromToday', () => {
  it('WINDOW_DAYS 为 30；今天=0，已过与窗口外（+30）不进入，+29 进入', () => {
    expect(WINDOW_DAYS).toBe(30);

    const todayPerson = makePerson({
      id: 'today',
      name: '妈妈',
      birthdayMonth: 6,
      birthdayDay: 1,
      salutation: '妈妈',
    });
    const yesterdayPerson = makePerson({
      id: 'yesterday',
      name: '老王',
      birthdayMonth: 5,
      birthdayDay: 31,
    });
    const plus29 = makePerson({
      id: 'plus29',
      name: '小张',
      birthdayMonth: 3,
      birthdayDay: 30,
    });
    const plus30 = makePerson({
      id: 'plus30',
      name: '小李',
      birthdayMonth: 3,
      birthdayDay: 31,
    });

    const juneHits = listUpcoming('2025-06-01', [todayPerson, yesterdayPerson], []);
    const todayBirthday = findBirthday(juneHits, 'today');
    expect(todayBirthday?.daysFromToday).toBe(0);
    expect(todayBirthday?.subjectName).toBe('妈妈');
    expect(findBirthday(juneHits, 'yesterday')).toBeUndefined();

    const marchHits = listUpcoming(
      '2025-03-01',
      [plus29, plus30],
      [],
    );
    expect(findBirthday(marchHits, 'plus29')?.date).toBe('2025-03-30');
    expect(findBirthday(marchHits, 'plus29')?.subjectName).toBe('小张');
    expect(findBirthday(marchHits, 'plus30')).toBeUndefined();
  });

  it('无人员时结果只有六个内置节日（跨年窗口含圣诞与元旦两条）', () => {
    const hits = listUpcoming('2025-12-15', [], []);
    expect(hits).toHaveLength(2);
    expect(hits.every((hit) => hit.occasionType === 'festival')).toBe(true);
    expect(findByCode(hits, 'christmas')?.date).toBe('2025-12-25');
    expect(findByCode(hits, 'new_year')?.date).toBe('2026-01-01');
    // 通用节日没有具体对象
    expect(hits.every((hit) => hit.subjectName === null)).toBe(true);
  });

  it('includeFestivals=false 时区间内不返回任何节日', () => {
    const hits = computeHitsInRange({
      today: '2025-01-01',
      from: '2025-01-01',
      to: '2025-12-31',
      persons: [],
      anniversaries: [],
      includeFestivals: false,
    });
    expect(hits).toHaveLength(0);
  });
});

describe('节日关注过滤（F11：festival_settings.disabled）', () => {
  it('不传 disabledFestivalCodes 时默认六个节日全部关注、全部出现', () => {
    const hits = computeHitsInRange({
      today: '2025-01-01',
      from: '2025-01-01',
      to: '2025-12-31',
      persons: [],
      anniversaries: [],
    });
    const festivalHits = hits.filter((hit) => hit.occasionType === 'festival');
    expect(festivalHits).toHaveLength(6);
    FESTIVAL_CODES.forEach((code) => {
      expect(findByCode(hits, code)).toBeDefined();
    });
  });

  it('disabled=1（取关）的节日不出现，其余五个照常；人员生日不受节日过滤影响', () => {
    const xmasBaby = makePerson({
      id: 'xmas-baby',
      name: '圣诞宝宝',
      birthdayMonth: 12,
      birthdayDay: 25,
    });
    const hits = computeHitsInRange({
      today: '2025-01-01',
      from: '2025-01-01',
      to: '2025-12-31',
      persons: [xmasBaby],
      anniversaries: [],
      disabledFestivalCodes: ['christmas'],
    });
    const festivalHits = hits.filter((hit) => hit.occasionType === 'festival');
    expect(festivalHits).toHaveLength(5);
    expect(findByCode(hits, 'christmas')).toBeUndefined();
    // 其他节日不受影响
    expect(findByCode(hits, 'new_year')).toBeDefined();
    expect(findByCode(hits, 'mothers_day')).toBeDefined();
    // 取关节日不过滤人员日子：人员 disabled 语义只停推送，引擎层不涉及
    expect(findBirthday(hits, 'xmas-baby')?.date).toBe('2025-12-25');
  });

  it('listUpcoming 同步过滤取关节日；重新关注（disabled=0/不传）后恢复', () => {
    // 2025-12-15 的 30 天窗口跨年含圣诞与元旦两条节日
    expect(listUpcoming('2025-12-15', [], [])).toHaveLength(2);

    const unfollowed = listUpcoming('2025-12-15', [], [], ['christmas']);
    expect(unfollowed).toHaveLength(1);
    expect(findByCode(unfollowed, 'christmas')).toBeUndefined();
    expect(findByCode(unfollowed, 'new_year')?.date).toBe('2026-01-01');

    // 重新关注：传空数组与不传等价，圣诞节恢复展示
    const refollowed = listUpcoming('2025-12-15', [], [], []);
    expect(refollowed).toHaveLength(2);
    expect(findByCode(refollowed, 'christmas')?.date).toBe('2025-12-25');
  });
});

describe('listFollowedFestivals 已关注节日长期倒计时（不受 30 天窗口限制）', () => {
  it('全部关注时返回 6 条，各为自今天起的下一次发生且按 date 升序；今天正逢节日时含今天', () => {
    // 2025-06-01：上半年节日已过，下次均落在 2025 下半年或 2026 年
    const hits = listFollowedFestivals('2025-06-01');
    expect(hits).toHaveLength(6);
    expect(hits.every((hit) => hit.occasionType === 'festival')).toBe(true);
    expect([...new Set(hits.map((hit) => hit.festivalCode))].sort()).toEqual(
      [...FESTIVAL_CODES].sort(),
    );
    expect(hits.map((hit) => hit.date)).toEqual([
      '2025-06-15', // 父亲节（2025 年尚未到）
      '2025-11-27', // 感恩节
      '2025-12-25', // 圣诞节
      '2026-01-01', // 元旦
      '2026-02-14', // 情人节
      '2026-05-10', // 母亲节（2025 年 5/11 已过）
    ]);
    expect(hits.every((hit) => hit.daysFromToday >= 0)).toBe(true);

    // 今天就是圣诞节：下一次发生即今天（daysFromToday=0），区间末的次年圣诞被去重
    const onChristmas = listFollowedFestivals('2025-12-25');
    const christmas = findByCode(onChristmas, 'christmas');
    expect(christmas?.date).toBe('2025-12-25');
    expect(christmas?.daysFromToday).toBe(0);
    expect(onChristmas.filter((hit) => hit.festivalCode === 'christmas')).toHaveLength(1);
  });

  it('disabledFestivalCodes 中的节日缺席，其余节日照常各一条', () => {
    const hits = listFollowedFestivals('2025-06-01', ['christmas', 'new_year']);
    expect(hits).toHaveLength(4);
    expect(findByCode(hits, 'christmas')).toBeUndefined();
    expect(findByCode(hits, 'new_year')).toBeUndefined();
    expect(findByCode(hits, 'thanksgiving')?.date).toBe('2025-11-27');
    expect(findByCode(hits, 'valentines_day')?.date).toBe('2026-02-14');
    expect([...new Set(hits.map((hit) => hit.festivalCode))]).toHaveLength(4);
  });

  it('跨年（today 取 12 月底）时元旦等节日落在次年且日期正确、按临近排序', () => {
    const hits = listFollowedFestivals('2025-12-31');
    expect(hits).toHaveLength(6);
    expect(hits.map((hit) => hit.date)).toEqual([
      '2026-01-01',
      '2026-02-14',
      '2026-05-10',
      '2026-06-21',
      '2026-11-26',
      '2026-12-25',
    ]);
    expect(hits.every((hit) => hit.year === 2026)).toBe(true);
    const newYear = findByCode(hits, 'new_year');
    expect(newYear?.date).toBe('2026-01-01');
    expect(newYear?.year).toBe(2026);
    expect(newYear?.daysFromToday).toBe(1);
  });
});

describe('listUpcoming 第 5 参 options.includeFestivals', () => {
  it('includeFestivals=false 时 30 天窗口内不产出节日，人员生日照常；缺省行为不变', () => {
    const xmasBaby = makePerson({
      id: 'xmas-baby',
      name: '圣诞宝宝',
      birthdayMonth: 12,
      birthdayDay: 25,
    });

    // 无人员且排除节日：窗口跨年也没有任何命中
    expect(
      listUpcoming('2025-12-15', [], [], undefined, { includeFestivals: false }),
    ).toHaveLength(0);

    // 有人员：只保留生日，圣诞/元旦节日均不产出
    const withPerson = listUpcoming(
      '2025-12-15',
      [xmasBaby],
      [],
      undefined,
      { includeFestivals: false },
    );
    expect(withPerson).toHaveLength(1);
    expect(findBirthday(withPerson, 'xmas-baby')?.date).toBe('2025-12-25');
    expect(withPerson.every((hit) => hit.occasionType !== 'festival')).toBe(true);

    // 不传 options：既有行为保持（窗口内圣诞与元旦两条节日）
    expect(listUpcoming('2025-12-15', [], [])).toHaveLength(2);
  });
});

describe('结果排序：date 升序，同日 title 升序', () => {
  it('同一天的多个日子按 title 码元升序，且整体日期非降（含跨年）', () => {
    const xmasBaby = makePerson({
      id: 'xmas-baby',
      name: '圣诞宝宝',
      birthdayMonth: 12,
      birthdayDay: 25,
    });
    const move = makeAnniversary({
      id: 'move',
      personId: 'xmas-baby',
      name: '乔迁',
      month: 12,
      day: 25,
    });

    const sameDay = computeHitsInRange({
      today: '2025-12-01',
      from: '2025-12-25',
      to: '2025-12-25',
      persons: [xmasBaby],
      anniversaries: [move],
    });
    expect(sameDay.map((hit) => hit.title)).toEqual(['乔迁', '圣诞节', '生日']);
    expect(sameDay.every((hit) => hit.date === '2025-12-25')).toBe(true);

    const jan5 = makePerson({
      id: 'jan5',
      name: '小寒',
      birthdayMonth: 1,
      birthdayDay: 5,
    });
    const crossYear = computeHitsInRange({
      today: '2025-12-20',
      from: '2025-12-20',
      to: '2026-01-10',
      persons: [jan5],
      anniversaries: [],
    });
    const dates = crossYear.map((hit) => hit.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates).toEqual(['2025-12-25', '2026-01-01', '2026-01-05']);
  });
});

describe('路由构造 routes', () => {
  it('生日：kind/year/personId 齐全', () => {
    expect(
      buildOccasionHref({ occasionType: 'birthday', personId: 'p-1', year: 2025 }),
    ).toBe('/occasion-detail?kind=birthday&year=2025&personId=p-1');
  });

  it('纪念日：带 personId 与 anniversaryId', () => {
    expect(
      buildOccasionHref({
        occasionType: 'anniversary',
        personId: 'p-1',
        anniversaryId: 'a-1',
        year: 2025,
      }),
    ).toBe(
      '/occasion-detail?kind=anniversary&year=2025&personId=p-1&anniversaryId=a-1',
    );
  });

  it('通用节日：只带 festivalCode，personId/anniversaryId 即使显式为 null 也不出现', () => {
    const href = buildOccasionHref({
      occasionType: 'festival',
      personId: null,
      anniversaryId: null,
      festivalCode: 'christmas',
      year: 2025,
    });
    expect(href).toBe(
      '/occasion-detail?kind=festival&year=2025&festivalCode=christmas',
    );
    expect(href).not.toContain('personId');
    expect(href).not.toContain('anniversaryId');
  });

  it('节日选人页与当日清单页 href', () => {
    expect(buildFestivalSelectHref('mothers_day', 2025)).toBe(
      '/festival/mothers_day/select?year=2025',
    );
    expect(buildDayListHref('2025-01-01')).toBe('/day-list?date=2025-01-01');
  });
});
