/**
 * 网关入参校验（T57 由 supabase/functions/generate-content/types.ts 原样移植）。
 *
 * 隐私原则：入参只含生成所必需的信息——日子类型、关系、特征描述、
 * 纪念日起始年份推导出的周年数、称呼/自称、条数；不收姓名、出生年份。
 */

const OCCASION_TYPES = ['birthday', 'anniversary', 'festival'];
const RELATIONS = ['家人', '挚友', '客户', '其他'];

function cleanText(value, max, field) {
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`);
  const text = value.trim();
  if (text.length === 0 || text.length > max) throw new Error(`${field} 长度需在 1–${max} 字之间`);
  return text;
}

/** 校验并归一化请求体；不合规直接抛错（调用方转 400） */
export function validateRequest(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('请求体必须是 JSON 对象');
  const body = raw;

  if (body.kind !== 'blessing' && body.kind !== 'gift') {
    throw new Error('kind 必须是 blessing 或 gift');
  }
  const kind = body.kind;

  // 祝福条数 1–10，与 App 设置页 blessing_count 范围一致
  let count = 3;
  if (body.count !== undefined && body.count !== null) {
    if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 1 || body.count > 10) {
      throw new Error('count 需为 1–10 的整数');
    }
    count = body.count;
  }
  if (kind === 'gift') count = 6;

  if (typeof body.occasion !== 'object' || body.occasion === null) {
    throw new Error('occasion 缺失');
  }
  const o = body.occasion;
  if (!OCCASION_TYPES.includes(o.type)) {
    throw new Error('occasion.type 非法');
  }
  const occasion = { type: o.type };
  if (occasion.type === 'anniversary') {
    occasion.anniversaryName = cleanText(o.anniversaryName, 20, 'anniversaryName');
    if (o.anniversaryYears !== undefined && o.anniversaryYears !== null) {
      if (
        typeof o.anniversaryYears !== 'number' ||
        !Number.isInteger(o.anniversaryYears) ||
        o.anniversaryYears < 0 ||
        o.anniversaryYears > 200
      ) {
        throw new Error('anniversaryYears 非法');
      }
      occasion.anniversaryYears = o.anniversaryYears;
    }
  }
  if (occasion.type === 'festival') {
    occasion.festivalName = cleanText(o.festivalName, 12, 'festivalName');
  }

  let person = null;
  if (body.person !== null && body.person !== undefined) {
    if (typeof body.person !== 'object') throw new Error('person 非法');
    const p = body.person;
    if (!RELATIONS.includes(p.relation)) throw new Error('relation 非法');
    if (!Array.isArray(p.traits)) throw new Error('traits 必须是数组');
    const traits = p.traits.slice(0, 5).map((t) => cleanText(t, 30, 'trait'));
    const salutation =
      p.salutation === null || p.salutation === undefined || p.salutation === ''
        ? null
        : cleanText(p.salutation, 20, 'salutation');
    const signature =
      p.signature === null || p.signature === undefined || p.signature === ''
        ? null
        : cleanText(p.signature, 20, 'signature');
    person = { relation: p.relation, traits, salutation, signature };
  }

  if (occasion.type !== 'festival' && !person) {
    throw new Error('生日 / 纪念日必须指定具体的人');
  }
  if (kind === 'gift' && !person) {
    throw new Error('礼物建议必须有具体对象（通用版节日不出礼物）');
  }

  return { kind, count, occasion, person };
}
