/**
 * 把「人 × 日子 × 年份」业务键施加到一个 PostgREST 查询构造器上（T56）。
 *
 * 云端 snapshot / card_state / sent_record 的业务唯一索引是 COALESCE 表达式，
 * 不能作为 on_conflict 目标，因此 upsert 一律「先按业务键 SELECT，再 PATCH/INSERT」。
 * 可空列必须用 is null（eq null 在 PostgREST 不生效）。
 * RLS 已隐式限定 user_id，这里不再显式加用户过滤。
 */
import type { OccasionKey } from '../../entities';

/**
 * supabase-js 未注册 Database 表泛型，过滤构造器是层级很深的推断类型；
 * 本函数只做 eq/is 结构化转发，用 any 通道透传，避免调用处链式类型实例化过深（TS2589）。
 */
// eslint 规则集未限制 any；这里的 any 仅用于透传 PostgREST 构造器
type AnyPostgrestBuilder = any;

export function applyOccasionFilters(
  query: AnyPostgrestBuilder,
  key: OccasionKey,
): AnyPostgrestBuilder {
  let q: AnyPostgrestBuilder = query
    .eq('occasion_type', key.occasionType)
    .eq('year', key.year);
  q = key.personId ? q.eq('person_id', key.personId) : q.is('person_id', null);
  q = key.anniversaryId
    ? q.eq('anniversary_id', key.anniversaryId)
    : q.is('anniversary_id', null);
  q = key.festivalCode
    ? q.eq('festival_code', key.festivalCode)
    : q.is('festival_code', null);
  return q;
}
