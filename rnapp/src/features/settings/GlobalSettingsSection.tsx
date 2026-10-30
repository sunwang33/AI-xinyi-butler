import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { TextField } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { getRepository } from '../../data/repository';
import type { AppSettings } from '../../data/entities';
import { rescheduleReminders } from '../reminders/scheduler';
import { parseAdvanceDays, parseBlessingCount, parseDeliveryHour } from './validate';

/** 设置落库后重算提醒调度（T23）；失败不阻断保存，静默忽略 */
function reschedule() {
  rescheduleReminders().catch(() => {});
}

/**
 * 全局提醒设置（T18）：默认提前天数（1–30）、送达钟点（0–23 整点）、祝福条数（1–10）。
 * 进入页面读仓储回填；输入失焦时校验，合法即持久化，非法弹中文提示并还原，不写库。
 */
export function GlobalSettingsSection({
  onSettingsChange,
}: {
  /** 设置加载或保存成功后回传最新设置，供单人分区取全局天数等 */
  onSettingsChange?: (settings: AppSettings) => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [advanceText, setAdvanceText] = useState('');
  const [hourText, setHourText] = useState('');
  const [countText, setCountText] = useState('');

  useEffect(() => {
    let cancelled = false;
    getRepository()
      .then((repo) => repo.getSettings())
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setAdvanceText(String(s.globalAdvanceDays));
        setHourText(String(s.deliveryHour));
        setCountText(String(s.blessingCount));
        onSettingsChange?.(s);
      })
      .catch(() => {
        if (!cancelled) Alert.alert('设置读取失败', '请稍后重新进入本页查看。');
      });
    return () => {
      cancelled = true;
    };
    // 仅在挂载时读一次仓储；回调为父组件稳定的 setState 包装
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 通用提交流程：解析 → 与现值比对 → 落库 → 重排调度；非法时还原输入 */
  async function commit<K extends 'globalAdvanceDays' | 'deliveryHour' | 'blessingCount'>(
    field: K,
    raw: string,
    parse: (text: string) => number | null,
    invalidTitle: string,
    invalidMessage: string,
  ): Promise<void> {
    if (!settings) return;
    const n = parse(raw);
    if (n === null) {
      Alert.alert(invalidTitle, invalidMessage);
      // 还原为最近一次已入库的值
      if (field === 'globalAdvanceDays') setAdvanceText(String(settings[field]));
      if (field === 'deliveryHour') setHourText(String(settings[field]));
      if (field === 'blessingCount') setCountText(String(settings[field]));
      return;
    }
    if (n === settings[field]) return;
    try {
      const repo = await getRepository();
      const next = await repo.updateSettings({ [field]: n } as Pick<AppSettings, K>);
      setSettings(next);
      onSettingsChange?.(next);
      reschedule();
    } catch {
      Alert.alert('保存失败', '设置没有保存，请稍后重试。');
      if (field === 'globalAdvanceDays') setAdvanceText(String(settings[field]));
      if (field === 'deliveryHour') setHourText(String(settings[field]));
      if (field === 'blessingCount') setCountText(String(settings[field]));
    }
  }

  return (
    <View>
      <TextField
        label="默认提前天数（1–30 天）"
        value={advanceText}
        onChangeText={setAdvanceText}
        onBlur={() =>
          commit(
            'globalAdvanceDays',
            advanceText,
            parseAdvanceDays,
            '提前天数无法保存',
            '请输入 1–30 之间的整数，不能为 0、31、负数或小数，也不能留空。',
          )
        }
        keyboardType="number-pad"
        placeholder="如 3"
      />
      <TextField
        label="提醒送达钟点（0–23 点，整点）"
        value={hourText}
        onChangeText={setHourText}
        onBlur={() =>
          commit(
            'deliveryHour',
            hourText,
            parseDeliveryHour,
            '送达钟点无法保存',
            '请输入 0–23 之间的整数整点（24 小时制），不能为负数、小数或留空。',
          )
        }
        keyboardType="number-pad"
        placeholder="如 9"
      />
      <TextField
        label="每次生成的祝福条数（1–10 条）"
        value={countText}
        onChangeText={setCountText}
        onBlur={() =>
          commit(
            'blessingCount',
            countText,
            parseBlessingCount,
            '祝福条数无法保存',
            '请输入 1–10 之间的整数，不能为 0、负数、小数或留空。',
          )
        }
        keyboardType="number-pad"
        placeholder="如 3"
        // 最后一项去掉 TextField 自带的下外边距，说明文字另起
        style={{ marginBottom: 0 }}
      />
      <Text
        style={{
          marginTop: spacing.sm,
          fontSize: fontSize.footnote,
          lineHeight: 18,
          color: colors.inkSoft,
        }}
      >
        提前天数对未单独设置的人与全部节日生效；钟点调整后对尚未送达的提醒立即生效；条数仅对之后新生成的祝福生效。
      </Text>
    </View>
  );
}
