/**
 * 人员表单纯函数校验（T11）
 *
 * 规则来源：spec 第 1 条、data-model 2.1–2.3：
 * - 姓名、关系、生日月日必填，其余选填，允许重名；
 * - 月为 1–12 整数；日按月份合法性校验，2 月允许 29 日（平年折算归日子引擎，数据不改存）；
 * - 出生年份 / 纪念日起始年份选填，填了须为合理四位整数；
 * - 纪念日名称必填（整行留空视为未添加，直接丢弃）；
 * - 特征 0–5 条，单条不超过 30 字。
 *
 * 本文件不含 React，不做 IO，方便后续复用与测试。
 */
import type { Relation } from '../../data/entities';

/** 特征条数上限（data-model 2.3） */
export const MAX_TRAITS = 5;
/** 单条特征字数上限 */
export const MAX_TRAIT_LENGTH = 30;
/** 年份（出生年份 / 纪念日起始年份）允许范围 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** 表单中的纪念日草稿（id 仅编辑态存在；key 供 React 列表使用） */
export interface AnniversaryDraft {
  key: string;
  id?: string;
  name: string;
  month: string;
  day: string;
  startYear: string;
}

/** 表单中的特征草稿 */
export interface TraitDraft {
  key: string;
  id?: string;
  content: string;
}

/** 人员表单值（数字字段在输入态一律为字符串） */
export interface PersonFormValues {
  name: string;
  relation: Relation | null;
  birthdayMonth: string;
  birthdayDay: string;
  birthYear: string;
  salutation: string;
  signature: string;
  anniversaries: AnniversaryDraft[];
  traits: TraitDraft[];
}

/** 单个纪念日的字段错误（键为空表示该项无错） */
export interface AnniversaryErrors {
  name?: string;
  month?: string;
  day?: string;
  startYear?: string;
}

/** 整表错误；空对象即校验通过 */
export interface PersonFormErrors {
  name?: string;
  relation?: string;
  birthdayMonth?: string;
  birthdayDay?: string;
  birthYear?: string;
  anniversaries?: AnniversaryErrors[];
  /** 每条特征的错误，下标与表单特征行对齐 */
  traits?: string[];
  /** 特征条数超过 5 条时的提示 */
  traitsLimit?: string;
}

/** 提交载荷：校验通过后的归一化数据（空字符串已转 null、内容已 trim） */
export interface PersonFormPayload {
  name: string;
  relation: Relation;
  birthdayMonth: number;
  birthdayDay: number;
  birthYear: number | null;
  salutation: string | null;
  signature: string | null;
  anniversaries: {
    id?: string;
    name: string;
    month: number;
    day: number;
    startYear: number | null;
  }[];
  traits: { id?: string; content: string }[];
}

/** 各月天数：2 月按 29 天上限放行（闰年判定与平年折算由日子引擎负责） */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 严格解析正整数；允许前导 0，带空格 / 小数 / 负号一律视为不合法 */
export function parseInteger(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

export function isMonthValid(text: string): boolean {
  const m = parseInteger(text);
  return m !== null && m >= 1 && m <= 12;
}

/** 日期合法性依赖月份；月份本身不合法时返回 false */
export function isMonthDayValid(monthText: string, dayText: string): boolean {
  const m = parseInteger(monthText);
  const d = parseInteger(dayText);
  if (m === null || m < 1 || m > 12) return false;
  if (d === null) return false;
  return d >= 1 && d <= DAYS_IN_MONTH[m - 1];
}

/** 年份选填：留空合法；填了必须是四位整数且在允许区间内 */
export function isOptionalYearValid(text: string): boolean {
  if (text === '') return true;
  const y = parseInteger(text);
  return y !== null && y >= MIN_YEAR && y <= MAX_YEAR;
}

/** 纪念日整行是否为空（名称 / 月 / 日 / 年均未填）；整行留空按「未添加」丢弃 */
function isAnniversaryEmpty(a: AnniversaryDraft): boolean {
  return a.name.trim() === '' && a.month === '' && a.day === '' && a.startYear === '';
}

/**
 * 纯函数校验，返回字段错误表（空对象表示通过）。
 */
export function validatePersonForm(values: PersonFormValues): PersonFormErrors {
  const errors: PersonFormErrors = {};

  if (values.name.trim() === '') {
    errors.name = '请填写姓名';
  }
  if (values.relation === null) {
    errors.relation = '请选择与自己的关系';
  }

  if (!isMonthValid(values.birthdayMonth)) {
    errors.birthdayMonth = values.birthdayMonth === '' ? '请填写生日月份' : '月份须为 1–12 的整数';
  }
  if (values.birthdayDay === '' || !isMonthDayValid(values.birthdayMonth, values.birthdayDay)) {
    errors.birthdayDay =
      values.birthdayDay === '' ? '请填写生日日期' : '日期不合法，请按所选月份填写';
  }

  if (!isOptionalYearValid(values.birthYear)) {
    errors.birthYear = `年份须为 ${MIN_YEAR}–${MAX_YEAR} 之间的整数`;
  }

  // 纪念日：整行留空丢弃；部分填写则名称、月日必填且合法
  const anniversaryErrors: AnniversaryErrors[] = [];
  for (const a of values.anniversaries) {
    if (isAnniversaryEmpty(a)) {
      anniversaryErrors.push({});
      continue;
    }
    const row: AnniversaryErrors = {};
    if (a.name.trim() === '') row.name = '请填写纪念日名称';
    if (!isMonthValid(a.month)) row.month = a.month === '' ? '请填写月份' : '须为 1–12';
    if (a.day === '' || !isMonthDayValid(a.month, a.day)) {
      row.day = a.day === '' ? '请填写日期' : '日期不合法';
    }
    if (!isOptionalYearValid(a.startYear)) row.startYear = `年份须为 ${MIN_YEAR}–${MAX_YEAR}`;
    anniversaryErrors.push(row);
  }
  if (anniversaryErrors.some((e) => Object.keys(e).length > 0)) {
    errors.anniversaries = anniversaryErrors;
  }

  // 特征：条数上限 + 单条字数（空行在 buildPayload 阶段丢弃，此处不拦）
  if (values.traits.length > MAX_TRAITS) {
    errors.traitsLimit = `最多填写 ${MAX_TRAITS} 条特征`;
  }
  const traitErrors = values.traits.map((t) =>
    t.content.length > MAX_TRAIT_LENGTH ? `单条特征不超过 ${MAX_TRAIT_LENGTH} 字` : '',
  );
  if (traitErrors.some((m) => m !== '')) {
    errors.traits = traitErrors;
  }

  return errors;
}

export function hasFormErrors(errors: PersonFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * 校验通过后把表单值归一化为提交载荷；校验不通过返回 null。
 * - 选填文本空串转 null；
 * - 丢弃整行留空的纪念日、内容为空的特征；
 * - 特征 position 由调用方按数组下标写入。
 */
export function buildPersonPayload(values: PersonFormValues): PersonFormPayload | null {
  if (hasFormErrors(validatePersonForm(values))) return null;

  return {
    name: values.name.trim(),
    relation: values.relation as Relation,
    birthdayMonth: parseInteger(values.birthdayMonth) as number,
    birthdayDay: parseInteger(values.birthdayDay) as number,
    birthYear: values.birthYear === '' ? null : parseInteger(values.birthYear),
    salutation: values.salutation.trim() === '' ? null : values.salutation.trim(),
    signature: values.signature.trim() === '' ? null : values.signature.trim(),
    anniversaries: values.anniversaries
      .filter((a) => !isAnniversaryEmpty(a))
      .map((a) => ({
        ...(a.id ? { id: a.id } : {}),
        name: a.name.trim(),
        month: parseInteger(a.month) as number,
        day: parseInteger(a.day) as number,
        startYear: a.startYear === '' ? null : parseInteger(a.startYear),
      })),
    traits: values.traits
      .filter((t) => t.content.trim() !== '')
      .map((t) => ({ ...(t.id ? { id: t.id } : {}), content: t.content.trim() })),
  };
}
