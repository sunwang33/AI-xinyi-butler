/**
 * 设备联网状态（T78）：根布局初始化一次，全 App 共享同一个在线/离线态。
 *
 * 判离线的口径（关键边界，避免误判）：
 * - 只认 NetInfo 的 type === 'none'（飞行模式 / 无任何活动连接）为离线；
 * - 设备连着 Wi-Fi 但 Supabase 被 SNI 阻断时 type 仍是 wifi（isInternetReachable
 *   也可能为 true），这种「已联网但服务不可达」绝不判成离线，继续走请求失败/超时路径；
 * - 启动与首次探测完成前一律按在线处理，避免开屏瞬间误挡生成入口。
 *
 * M12/T56 的云同步复用同一状态：订阅 store 即可感知「恢复在线」并触发增量同步。
 */
import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

interface NetworkState {
  /** 设备本地是否有活动网络；只有明确无连接才为 false，未知态按在线 */
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  online: true,
  setOnline: (online) => set({ online }),
}));

/** 组件用的便捷选择器 */
export function useOnline(): boolean {
  return useNetworkStore((s) => s.online);
}

/**
 * 是否为「设备本地确认为无网络」。独立纯函数便于单测：
 * 连着 Wi-Fi 但不可达（含 isInternetReachable=false）一律返回 false。
 */
export function isDeviceOffline(state: Pick<NetInfoState, 'type'>): boolean {
  return state.type === NetInfoStateType.none;
}

let unsubscribe: (() => void) | null = null;

/** 根布局调用一次：先取当前态，再订阅后续变化（重复调用安全） */
export function initNetwork(): void {
  if (unsubscribe) {
    return;
  }
  const apply = (state: NetInfoState) => {
    useNetworkStore.getState().setOnline(!isDeviceOffline(state));
  };
  // 探测失败不改变默认在线态：让具体请求自己暴露失败，而不是全局误判离线
  NetInfo.fetch()
    .then(apply)
    .catch(() => undefined);
  unsubscribe = NetInfo.addEventListener(apply);
}
