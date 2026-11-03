/**
 * 电子贺卡导出（M9 T46）：把屏幕上已组合好的贺卡艺术区截成图片，
 * 或存入系统相册、或经系统分享面板发出。
 *
 * 技术选型（D5：react-native-view-shot + expo-media-library + 系统 Share）：
 * - 截图用 react-native-view-shot 的 captureRef，按门禁 A3（2026-11-02 重开）输出 1860×2480 竖版 3:4 JPG。
 *   该库含原生代码、不在 Expo Go 内，T46 真机验收需 dev build。
 * - 存相册用 expo-media-library 新版（next）API：Asset.create 落盘，
 *   权限以 writeOnly 申请——只把本 App 自己的图片写入共享存储，不读取用户图库（最小授权）。
 *   Android 10+ 写自己的媒体本就免存储权限；低版本 / 被拒走 B 组拍板的降级。
 * - 分享用 expo-sharing（弹的就是系统分享面板，文件走 App 缓存 + FileProvider，
 *   不需要任何相册权限）。内置 Share 只能发文本、发不了图片文件，故不用它。
 *
 * 权限纪律（B 组 2026-11-02 拍板，同通知 T22「一生只请一次」）：
 * - status 为 undetermined（从没问过）才发起一次系统请求；
 * - 一旦 denied（问过被拒，或在系统设置里收回），不再主动弹窗，返回 'denied'，
 *   由界面给出「去系统设置开启 / 改用分享」的克制引导；
 * - 分享始终可用，导出永远不会被相册权限卡死。
 */
import { PermissionStatus } from 'expo-media-library';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { findNodeHandle } from 'react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_ART_SIZE } from './templates';

/** 导出的临时图片文件名（view-shot 要求 Android 文件名至少 3 个字符） */
const CARD_FILE_NAME = 'xinyi-card';

/**
 * 截取贺卡艺术区（不含纸脚操作区）。传入 Postcard 艺术区宿主 View 的 ref。
 * 输出尺寸严格按门禁 A3（1860×2480 竖版 3:4），与艺术区布局同比，不会拉伸变形。
 * 返回 App 缓存目录下的临时 JPG 文件 uri。
 *
 * Fabric 新架构下直接把组件实例交给 view-shot 的旧 UIBlock 截图路径会在
 * 互操作层抛 AssertionError，故先用 findNodeHandle 解析成原生宿主 tag（number）再截。
 */
export async function captureCardArt(
  artRef: RefObject<ComponentRef<typeof View> | null>,
): Promise<string> {
  const tag = findNodeHandle(artRef.current);
  if (tag == null) {
    throw new Error('贺卡视图尚未就绪，暂时无法生成图片');
  }
  return captureRef(tag, {
    width: CARD_ART_SIZE.width,
    height: CARD_ART_SIZE.height,
    format: 'jpg',
    quality: 0.95,
    result: 'tmpfile',
    fileName: CARD_FILE_NAME,
  });
}

/** 存相册失败原因：denied＝被拒/需去设置；unavailable＝当前环境不支持；error＝其它异常 */
export type SaveToLibraryResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'unavailable' | 'error'; message?: string };

/**
 * 把已截好的图片写入系统相册。自带 writeOnly 权限的「一生一次」流程：
 * undetermined 才请求，denied 直接返回让界面走降级引导，不反复弹系统窗。
 */
export async function saveCardToLibrary(fileUri: string): Promise<SaveToLibraryResult> {
  try {
    const current = await MediaLibrary.getPermissionsAsync(true);

    if (current.status !== PermissionStatus.GRANTED) {
      if (current.status === PermissionStatus.UNDETERMINED) {
        // 第一次：发起唯一一次系统请求（writeOnly 只写不读）
        const answer = await MediaLibrary.requestPermissionsAsync(true);
        if (answer.status !== PermissionStatus.GRANTED) {
          // 用户当场拒绝：此后不再主动弹，交界面引导去系统设置或改用分享
          return { ok: false, reason: 'denied' };
        }
      } else {
        // denied（问过被拒 / 系统设置中收回）：不再请求
        return { ok: false, reason: 'denied' };
      }
    }

    // 新版 API：Asset.create 把本地文件作为图片存入共享媒体库
    await MediaLibrary.Asset.create(fileUri);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** 分享结果：unavailable＝设备无可用分享面版（极罕见）；error＝调起异常 */
export type ShareCardResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'error' };

/**
 * 调起系统分享面板发送贺卡图片（FileProvider，不需相册权限）。
 * 用户在面板里取消也视为正常返回，不报错。
 */
export async function shareCardImage(fileUri: string): Promise<ShareCardResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'unavailable' };
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: 'image/jpeg',
      dialogTitle: '发送这张贺卡',
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
