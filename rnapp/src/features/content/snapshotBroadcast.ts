/**
 * 当年心意快照的内存广播通道（M9 T45）。
 *
 * 背景：祝福 / 礼物的生成状态原本是 useGeneratedContent 的组件局部 state，
 * 用户在心意详情页内点「重新生成」后，只有祝福区自己拿得到新快照，同在一页的
 * 电子贺卡区无从得知（贺卡要据此填第一条祝福、显示 ‹ n/N › 翻页器）。
 *
 * 这里用项目既定的 Zustand 做一条极轻的转发通道：生成器每次落库 content_snapshots
 * 后把整行 publish 进来，贺卡区按日子业务键订阅即可即时刷新；不做持久化、不触发
 * 生成、也不改变仓储这一唯一数据来源——首屏仍由各分区自行从仓储读取（离线可看）。
 */
import { create } from 'zustand';
import type { ContentSnapshot, OccasionKey } from '../../data/entities';

/** 日子业务键的稳定字符串：与 card_states / content_snapshots 的身份口径保持一致 */
export function occasionKeyId(key: OccasionKey): string {
  return [
    key.personId ?? '',
    key.occasionType,
    key.anniversaryId ?? '',
    key.festivalCode ?? '',
    key.year,
  ].join('|');
}

interface SnapshotBroadcastState {
  /** 键为 occasionKeyId，值为最近一次落库的完整快照行（仅本进程内存） */
  rows: Record<string, ContentSnapshot>;
  publish: (key: OccasionKey, snapshot: ContentSnapshot) => void;
}

const useSnapshotBroadcastStore = create<SnapshotBroadcastState>((set) => ({
  rows: {},
  publish: (key, snapshot) =>
    set((state) => ({ rows: { ...state.rows, [occasionKeyId(key)]: snapshot } })),
}));

/** 生成器落库后调用：把最新快照行广播给同一页内的其它分区 */
export function publishSnapshot(key: OccasionKey, snapshot: ContentSnapshot): void {
  useSnapshotBroadcastStore.getState().publish(key, snapshot);
}

/**
 * 订阅某个日子的最新广播快照。无广播（如刚进页面、尚无人生成）时返回 undefined，
 * 调用方应回退到自己从仓储读到的首屏快照。
 */
export function useBroadcastSnapshot(key: OccasionKey): ContentSnapshot | undefined {
  const id = occasionKeyId(key);
  return useSnapshotBroadcastStore((state) => state.rows[id]);
}
