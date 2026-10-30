/**
 * 节日关注管理弹层（T66，F11）：
 * - 提醒页节日区标题「已关注 N 个」打开，是重新关注的唯一入口
 *   （就地取关后节日行从列表消失，只能在此恢复）；
 * - 六个内置节日逐行 ListRow + Toggle：开关=是否关注（!disabled），
 *   改动即写 festival_settings 并 rescheduleReminders，乐观更新、失败回滚；
 * - 每次写库后 onChanged 通知提醒页静默重算（节日区即时增删）；
 * - 副标题展示该节日今年的公历日期，日期取自 T15 节日常量。
 */
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ListRow, Sheet, Toggle } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { getRepository } from '../../data/repository';
import { FESTIVAL_CODES, type FestivalCode } from '../../data/entities';
import { FESTIVALS } from '../occasions/festivals';
import { rescheduleReminders } from '../reminders/scheduler';
import { formatMonthDay } from './dateLabel';

export function FestivalManageSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  /** 任一关注状态写库后回调：提醒页静默重算节日区 */
  onChanged: () => void;
}) {
  const [disabledMap, setDisabledMap] = useState<Record<FestivalCode, boolean> | null>(null);

  // 弹层由父级条件挂载，打开时读一版最新状态
  useEffect(() => {
    let active = true;
    getRepository()
      .then((repo) => repo.listFestivalSettings())
      .then((list) => {
        if (!active) {
          return;
        }
        const map = {} as Record<FestivalCode, boolean>;
        list.forEach((item) => {
          map[item.festivalCode] = item.disabled;
        });
        setDisabledMap(map);
      })
      .catch(() => {
        if (active) {
          Alert.alert('读取失败', '节日关注状态没有读出来，请稍后重试。');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  /** 开关即落库；乐观更新，失败回滚并提示 */
  const toggle = async (code: FestivalCode, nextDisabled: boolean) => {
    if (!disabledMap) {
      return;
    }
    const previous = disabledMap[code] ?? false;
    setDisabledMap({ ...disabledMap, [code]: nextDisabled });
    try {
      const repo = await getRepository();
      await repo.setFestivalDisabled(code, nextDisabled);
      // 重算调度：取关即时取消推送、重关注即时恢复；拒权由 T68 守卫短路
      rescheduleReminders().catch(() => {});
      onChanged();
    } catch {
      Alert.alert('设置失败', '关注状态没有保存，请稍后重试。');
      setDisabledMap((cur) => (cur ? { ...cur, [code]: previous } : cur));
    }
  };

  const todayYear = new Date().getFullYear();

  return (
    <Sheet visible={visible} title="节日管理" onClose={onClose}>
      <View style={{ gap: spacing.sm }}>
        {FESTIVAL_CODES.map((code) => {
          const festival = FESTIVALS.find((item) => item.code === code);
          const disabled = disabledMap?.[code] ?? false;
          return (
            <ListRow
              key={code}
              avatar={festival?.name.slice(0, 1)}
              avatarTone="night"
              title={festival?.name ?? code}
              subtitle={festival ? formatMonthDay(festival.dateOf(todayYear)) : undefined}
              right={
                <Toggle
                  value={!disabled}
                  onValueChange={(followed) => {
                    void toggle(code, !followed);
                  }}
                />
              }
            />
          );
        })}
      </View>
      <Text
        style={{
          marginTop: spacing.md,
          fontSize: fontSize.footnote,
          color: colors.inkFaint,
          textAlign: 'center',
        }}
      >
        取关后不再提醒、不在节日区展示；历史已收藏与已送出的内容不受影响
      </Text>
    </Sheet>
  );
}
