/**
 * 一类心意内容（祝福 / 礼物）的生成状态 hook（M6 T31/T33/T34，M7 T37）。
 *
 * - 进入页面：读当年快照，有内容直接呈现（离线也可看）；
 * - 已同意告知且尚无内容：自动生成一次（每个 query 挂载周期只自动一次，防失败循环）；
 * - 失败：暴露 error，UI 显示「需要网络」+ 手动重试；
 * - 重新生成：显式调用 run()，结果替换当年快照。
 *
 * query（id）切换时的状态归零一律用「按 id 派生」实现，不在 effect 里同步 setState，
 * 避免级联渲染（react-hooks/set-state-in-effect）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiConsent, ContentSnapshot, OccasionKey } from '../../data/entities';
import { getRepository } from '../../data/repository';
import { generateContent } from './generator';
import { occasionKeyId as keyId } from './snapshotBroadcast';
import type { ContentContext, ContentError } from './types';

export type ContentKind = 'blessing' | 'gift';

/** 带 query 标识的状态：id 不匹配当前 query 时一律视为「别的页面」的旧值 */
interface Keyed<T> {
  id: string;
  value: T;
}

export function useGeneratedContent(
  kind: ContentKind,
  occasionKey: OccasionKey,
  context: ContentContext,
  consent: AiConsent | null,
  options: { count: number; festivalName?: string | null },
) {
  const id = keyId(occasionKey);

  const [entry, setEntry] = useState<Keyed<ContentSnapshot | null> | null>(null);
  const [failedLoadId, setFailedLoadId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Keyed<{ error: ContentError | null; fallbackUsed: boolean }> | null>(
    null,
  );

  const autoTriedRef = useRef(false);
  // 档案/特征异步加载完成后 context 会变；run 经 ref 始终读最新值
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  const hasContent = useCallback(
    (row: ContentSnapshot | null) =>
      kind === 'blessing' ? !!row?.blessings?.length : !!row?.gifts?.length,
    [kind],
  );

  // 读取当年快照（query 变化时按 id 重新读）
  useEffect(() => {
    let active = true;
    autoTriedRef.current = false;
    getRepository()
      .then((repo) => repo.getSnapshot(occasionKey))
      .then((row) => {
        if (active) setEntry({ id, value: row });
      })
      .catch(() => {
        // 读失败也结束加载态，页面显示「需要网络」与手动重试
        if (active) setFailedLoadId(id);
      });
    return () => {
      active = false;
    };
    // occasionKey 每次渲染为新对象，以拼好的 id 为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 仅展示属于当前 query 的状态
  const snapshot = entry?.id === id ? entry.value : null;
  const loaded = entry?.id === id || failedLoadId === id;
  const busy = busyId === id;
  const error = notice?.id === id ? notice.value.error : null;
  const fallbackUsed = notice?.id === id ? notice.value.fallbackUsed : false;

  const run = useCallback(async () => {
    setBusyId(id);
    setNotice({ id, value: { error: null, fallbackUsed: false } });
    try {
      const repo = await getRepository();
      const result = await generateContent(repo, kind, occasionKey, contextRef.current, {
        count: options.count,
        festivalName: options.festivalName ?? null,
      });
      setEntry({ id, value: result.snapshot });
      setNotice({ id, value: { error: null, fallbackUsed: result.fallbackUsed } });
    } catch (err) {
      // 失败行（fail_count/status）已落库；回读一次让计数与状态同步
      const repo = await getRepository();
      setEntry({ id, value: await repo.getSnapshot(occasionKey) });
      setNotice({ id, value: { error: err as ContentError, fallbackUsed: false } });
    } finally {
      setBusyId(null);
    }
    // occasionKey 每次渲染为新对象，以拼好的 id 为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind, options.count, options.festivalName]);

  // 已同意且尚无内容时自动生成一次（失败后不自动重试，等用户手动点）。
  // 经微任务触发，使 run 内的 setState 发生在本次 effect 提交之后。
  useEffect(() => {
    if (!loaded || consent !== 'agreed' || autoTriedRef.current) return;
    if (!hasContent(snapshot) && !busy) {
      autoTriedRef.current = true;
      void Promise.resolve().then(run);
    }
  }, [loaded, consent, snapshot, busy, hasContent, run]);

  return {
    snapshot,
    busy,
    error,
    fallbackUsed,
    hasContent: hasContent(snapshot),
    /** 上一轮是否失败（含重开 App 后从库内恢复的 failed 状态） */
    failedBefore: !hasContent(snapshot) && snapshot?.status === 'failed',
    run,
  };
}
