/**
 * AI 生成告知状态（T28）：app_settings.ai_consent。
 * pending=未表态（首次点生成时弹告知）；agreed=同意（不再弹、可自动生成）；
 * declined=暂不同意（保留生成入口，下次点击再次弹告知）。
 */
import { useCallback, useEffect, useState } from 'react';
import type { AiConsent } from '../../data/entities';
import { getRepository } from '../../data/repository';

export function useAiConsent() {
  const [consent, setConsent] = useState<AiConsent | null>(null);

  useEffect(() => {
    let active = true;
    getRepository()
      .then((repo) => repo.getSettings())
      .then((settings) => {
        if (active) setConsent(settings.aiConsent);
      })
      .catch(() => {
        // 读取失败保持 null，页面不自动生成、由用户点击入口时再试
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (value: AiConsent) => {
    const repo = await getRepository();
    const settings = await repo.updateSettings({ aiConsent: value });
    setConsent(settings.aiConsent);
    return settings.aiConsent;
  }, []);

  const agree = useCallback(() => persist('agreed'), [persist]);
  const decline = useCallback(() => persist('declined'), [persist]);
  /** 撤回同意（T28 B 组门禁：服务说明页提供入口），撤回后回到未表态 */
  const reset = useCallback(() => persist('pending'), [persist]);

  return { consent, agree, decline, reset };
}
