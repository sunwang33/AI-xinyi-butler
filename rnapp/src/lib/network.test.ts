/**
 * 离线判定纯函数单测（T78）。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import { NetInfoStateType } from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { isDeviceOffline } from './network';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

/** 仅指定 type 造一个 NetInfoState（其余字段本测不关心） */
function stateOf(type: NetInfoStateType): Pick<NetInfoState, 'type'> {
  return { type };
}

describe('isDeviceOffline（T78 边界：只认本地无连接）', () => {
  it('type=none（飞行模式/无连接）判为离线', () => {
    expect(isDeviceOffline(stateOf(NetInfoStateType.none))).toBe(true);
  });

  it('wifi / cellular / vpn / unknown 一律不算离线', () => {
    expect(isDeviceOffline(stateOf(NetInfoStateType.wifi))).toBe(false);
    expect(isDeviceOffline(stateOf(NetInfoStateType.cellular))).toBe(false);
    expect(isDeviceOffline(stateOf(NetInfoStateType.vpn))).toBe(false);
    expect(isDeviceOffline(stateOf(NetInfoStateType.unknown))).toBe(false);
  });

  it('连着 Wi-Fi 但 Supabase 被 SNI 阻断（isInternetReachable=false）不得判离线', () => {
    // 关键边界：此类场景必须继续走请求失败路径，而不是即时离线态
    const blocked = { type: NetInfoStateType.wifi, isConnected: true, isInternetReachable: false };
    expect(isDeviceOffline(blocked as Pick<NetInfoState, 'type'>)).toBe(false);
  });
});
