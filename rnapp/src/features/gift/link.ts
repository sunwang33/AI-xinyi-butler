/**
 * 礼物「去看看」电商跳转（M7 T38；门禁 D7+A1 于 2026-10-31 拍板）。
 *
 * - 平台：淘宝 + 京东；搜索词由 AI 返回（A1②）；
 * - 统一用 HTTPS 搜索结果页链接（B 组）：已装电商 App 时 Android 通常直接唤起，
 *   未安装则打开浏览器网页搜索，不做安装检测、不声明 queries；
 * - 纯外跳，不改变 App 导航栈，从电商返回后仍停留在原心意详情。
 */
import { Linking } from 'react-native';

export const GIFT_PLATFORMS = [
  {
    code: 'taobao',
    label: '淘宝',
    buildUrl: (term: string) => `https://s.taobao.com/search?q=${encodeURIComponent(term)}`,
  },
  {
    code: 'jd',
    label: '京东',
    // 必须用移动版搜索域名：search.jd.com（PC）在手机上会被京东 App 拦到首页丢词，
    // 无 App 时浏览器又跳风控页；so.m.jd.com 两种场景都直达移动搜索结果（真机实测 2026-10-31）
    buildUrl: (term: string) =>
      `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(term)}&searchFrom=search`,
  },
] as const;

export type GiftPlatformCode = (typeof GIFT_PLATFORMS)[number]['code'];

/** 打开某平台的搜索结果页 */
export async function openGiftSearch(
  platform: GiftPlatformCode,
  searchTerm: string,
): Promise<void> {
  const target = GIFT_PLATFORMS.find((p) => p.code === platform);
  if (!target) return;
  const term = searchTerm.trim();
  if (!term) return;
  await Linking.openURL(target.buildUrl(term));
}
