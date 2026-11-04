/**
 * 行内「标记已送出」按钮（M11 T50），对应原型 .sentchip 的行内用法：
 * 未标记＝灰描边空圈 ＋「标记送出」；已送出＝蜜蜡描边圆圈勾 ＋「已送出」
 * （状态勾选沿用原型蜜蜡色系；印泥红邮戳留给历史流水的 .sent-mark）。
 * 与蜜蜡书签的「已收藏」靠图标（圆勾 / 书签）与文案区分。
 *
 * SentToggle 为智能按钮：
 * - 该年该种类无记录 → 直接标记；
 * - 当前内容就是标记时那条 → 二次确认后撤销；
 * - 该年该种类标记的是别的内容（重新生成 / 换了版本）→ 二次确认后用当前内容更改。
 * 判定逻辑在纯函数 decideSentAction，确认弹层是 G-A4「更改需用户确认」的落点。
 */
import { useState } from 'react';
import { Alert, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ContentKind, ContentPayload } from '../../data/entities';
import { colors, fonts, fontSize } from '../../theme/tokens';
import { payloadFingerprint } from '../favorites/fingerprint';
import { decideSentAction, findYearKind, SENT_KIND_LABEL } from './sentDecision';
import type { SentStateApi } from './useSentRecords';

/** 小圆戳图标：灰圈勾（未标记）/ 红圈红勾（已送出） */
function StampCheckIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" fill="none" stroke={color} strokeWidth={1.6} />
      <Path
        d="M8.4 12.2l2.4 2.4 4.8-5.2"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        // 未标记时只显示空圈，已送出才打勾
        opacity={active ? 1 : 0}
      />
    </Svg>
  );
}

/** 纯展示药丸（底部状态面板等受控处也可复用） */
export function SentButton({
  active,
  busy = false,
  idleLabel = '标记送出',
  activeLabel = '已送出',
  onPress,
  style,
}: {
  active: boolean;
  busy?: boolean;
  idleLabel?: string;
  activeLabel?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const color = active ? colors.honeyDeep : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, busy }}
      accessibilityLabel={active ? activeLabel : idleLabel}
      disabled={busy}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          borderWidth: 1,
          borderColor: active ? colors.honey : colors.line,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          opacity: busy ? 0.5 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <StampCheckIcon active={active} color={color} />
      <Text
        style={{
          fontFamily: active ? fonts.sansMedium : fonts.sans,
          fontSize: fontSize.footnote,
          color,
        }}
      >
        {active ? activeLabel : idleLabel}
      </Text>
    </Pressable>
  );
}

/** 智能已送出开关：自算高亮态、自跑 add / 更改确认 / 撤销确认 */
export function SentToggle({
  api,
  year,
  kind,
  payload,
  idleLabel,
  activeLabel,
  style,
}: {
  api: SentStateApi;
  year: number;
  kind: ContentKind;
  payload: ContentPayload;
  idleLabel?: string;
  activeLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [busy, setBusy] = useState(false);
  const records = api.records ?? [];
  const existing = findYearKind(records, year, kind);
  // 仅当该年该种类标记的就是当前这条时才亮「已送出」；标记的是别的内容时保持未标记态
  const active =
    existing !== null &&
    payloadFingerprint(kind, payload) ===
      payloadFingerprint(existing.kind, existing.payload);

  const runMark = async () => {
    setBusy(true);
    try {
      await api.mark(year, kind, payload);
    } catch (e) {
      console.warn('[T50] markSent failed:', e);
      Alert.alert('暂时没记下', '本地数据写入失败，请稍后再试。');
    } finally {
      setBusy(false);
    }
  };

  const runUnmark = async (id: string) => {
    setBusy(true);
    try {
      await api.unmark(id);
    } catch (e) {
      console.warn('[T50] unmarkSent failed:', e);
      Alert.alert('暂时没取消掉', '本地数据写入失败，请稍后再试。');
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (busy) {
      return;
    }
    const label = SENT_KIND_LABEL[kind];
    const decision = decideSentAction(records, year, kind, payload);

    if (decision.type === 'add') {
      void runMark();
      return;
    }
    if (decision.type === 'unmark') {
      Alert.alert(
        `取消这条「${label}已送出」标记？`,
        '取消后不影响祝福、礼物或贺卡本身，以后还可以重新标记。',
        [
          { text: '再想想', style: 'cancel' },
          { text: '取消标记', style: 'destructive', onPress: () => void runUnmark(decision.existing.id) },
        ],
      );
      return;
    }
    // replace：同年同类标记的是别的内容，确认后用当前内容更改（G-A4 upsert）
    Alert.alert(
      `更改今年已送出的${label}？`,
      `今年已经标记过送出的${label}。要用当前这条替换吗？标记时间也会更新为现在。`,
      [
        { text: '再想想', style: 'cancel' },
        { text: '用这条更改', onPress: () => void runMark() },
      ],
    );
  };

  return (
    <SentButton
      active={active}
      busy={busy}
      idleLabel={idleLabel}
      activeLabel={activeLabel}
      onPress={onPress}
      style={style}
    />
  );
}
