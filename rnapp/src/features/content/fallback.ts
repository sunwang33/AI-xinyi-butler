/**
 * 祝福连续 3 次失败后的通用兜底文案（spec 全局规则 3 / T34）。
 * 不针对任何个人：不含关系、称呼、特征；只与日子类型相关，可离线展示。
 * 礼物不做兜底（M7 B 组门禁 2026-10-31 拍板）。
 */
import type { OccasionType } from '../../data/entities';

/** 生日通用池 */
const BIRTHDAY_POOL = [
  '生日快乐！愿新的一岁平安顺遂，每天都有好心情。',
  '祝你生日快乐，身体健康，万事顺意，想见的人都能常常见。',
  '又长大一岁，愿你心里有光、脚下有路，生日这天只管开心。',
  '生日快乐！愿日子温柔，所愿皆有回响，所行皆坦途。',
  '祝你新的一岁轻松自在，忙有所得，闲有所趣。',
  '生日快乐，愿这一年的你被好好对待，也被许多小事治愈。',
];

/** 纪念日通用池（不杜撰年份） */
const ANNIVERSARY_POOL = [
  '纪念日快乐！愿这个特别的日子被认真记住，未来的每一年都值得期待。',
  '祝你们的纪念日快乐，一路走来的用心，都会变成往后的底气。',
  '纪念日这一天，把祝福送给认真生活的你们：平安、长久、常欢喜。',
  '又到这个值得纪念的日子，愿所有重要的瞬间都被好好珍藏。',
  '纪念日快乐，愿彼此陪伴的日子细水长流，温暖常在。',
  '在这个特别的日子道一声祝福：愿年年有今日，岁岁有今朝。',
];

/** 节日通用池（{name} 替换为节日名） */
const FESTIVAL_POOL = [
  '{name}快乐！愿这个节日被好好度过，身边有想念的人，桌上有爱吃的菜。',
  '祝你{name}安康顺意，节日的热闹是真的，心里的踏实也是真的。',
  '{name}到了，愿你被祝福环绕，也把这份心意送给你在乎的人。',
  '祝{name}快乐，愿忙碌的日子在这一天慢下来，好好休息，好好相聚。',
  '{name}之际，愿你平安喜乐，所有美好的约定都能如期而至。',
  '祝你{name}愉快，愿节日的灯火和身边的笑声，都属于你。',
];

/**
 * 取 N 条通用兜底祝福：按池子顺序取，count 超过池长时循环（条数与 blessings 结构对齐）。
 */
export function pickFallbackBlessings(
  occasionType: OccasionType,
  count: number,
  festivalName?: string | null,
): string[] {
  const base =
    occasionType === 'birthday'
      ? BIRTHDAY_POOL
      : occasionType === 'anniversary'
        ? ANNIVERSARY_POOL
        : FESTIVAL_POOL.map((text) => text.replace('{name}', festivalName?.trim() || '节日'));
  // 与设置页 blessing_count 上限一致；超过池长（6）时循环取，允许重复
  const total = Math.max(1, Math.min(count, 10));
  return Array.from({ length: total }, (_, i) => base[i % base.length]);
}
