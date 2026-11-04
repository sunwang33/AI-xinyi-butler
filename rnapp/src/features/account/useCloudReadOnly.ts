/**
 * 云数据只读模式判定（M12 T56，门禁 G-A6）。
 *
 * 已登录且设备明确无网络（飞行模式 / 无连接）时，七张上云表进入只读：
 * 写入口统一禁用并给出说明；恢复网络后自动解除（写后防抖拉取见 lib/sync）。
 * 注意未登录用户的数据只存在本机，离线时仍可正常写入，不在此列。
 */
import { useOnline } from '../../lib/network';
import { useAccountStore } from './authStore';

/** 登录态 + 设备离线 = 云数据只读 */
export function useCloudReadOnly(): boolean {
  const online = useOnline();
  const loggedIn = useAccountStore((s) => s.session !== null);
  return loggedIn && !online;
}

/** 只读模式下点击写入口时的统一说明 */
export const CLOUD_READONLY_ALERT = {
  title: '离线只读模式',
  message: '当前没有网络连接，登录态下数据暂为只读。恢复网络后即可新增、编辑、收藏与标记。',
} as const;

/** 写操作捕获到异常时，统一取出可展示的中文原因 */
export function writeErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
