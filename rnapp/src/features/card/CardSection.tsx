/**
 * 心意详情 · 电子贺卡分区（M9 T44）。
 *
 * - 进入即自动组合：首次打开若无 card_states，立即写入默认模板（mountain）+
 *   selected_index=0；页面上没有单独的「生成」按钮（spec 第 10 条）。
 * - 称呼取 salutation（未填用姓名）；落款取 signature，未填整块不显示；通用版节日无人员，二者皆无。
 * - 三套模板不按日子分组（B 组 2026-11-01 拍板），自由切换；切换只改 template_code，
 *   祝福与编辑不丢失。
 * - 祝福文字只读当年快照选中条（T44 默认第一条）；无快照按 A2「留空、可手写」呈现引导。
 *   左右切换祝福与手写编辑在 T45 接入，本分区只读、不触发 AI 生成（生成归祝福区）。
 *
 * 状态生命周期：父页面以日子业务键（headerKey）作为本分区的 key，切换日子时整块重挂、
 * state 自然回到初始加载态。因此挂载 effect 每个实例只跑一次，也不在 effect 体内同步
 * setState（避免级联渲染）；写库结果在 await 之后的微任务中回填。
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Card } from '../../components';
import type { CardState, OccasionKey, Person } from '../../data/entities';
import { getRepository } from '../../data/repository';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { Postcard } from './Postcard';
import {
  CARD_ART_SIZE,
  CARD_TEMPLATES,
  DEFAULT_CARD_TEMPLATE,
  getCardTemplate,
} from './templates';

export function CardSection({
  occasionKey,
  person,
  dateLabel,
}: {
  occasionKey: OccasionKey;
  /** 通用版节日为 null */
  person: Person | null;
  /** 日期圆圈文本，如「10·31」，由页面按日子类型算好传入 */
  dateLabel: string;
}) {
  const [card, setCard] = useState<CardState | null>(null);
  // 当年祝福快照（只读）；null 表示尚未生成 / 读取失败，贺卡按 A2 留空
  const [blessings, setBlessings] = useState<string[] | null>(null);

  // 挂载即自动组合 + 读当年祝福快照（只读，不触发 AI 生成）。
  // 切换日子由父组件 key 重挂驱动，本 effect 对每个实例只跑一次。
  useEffect(() => {
    let active = true;
    (async () => {
      const repo = await getRepository();
      const existing = await repo.getCardState(occasionKey);
      const state =
        existing ??
        (await repo.upsertCardState({
          ...occasionKey,
          templateCode: DEFAULT_CARD_TEMPLATE,
          selectedIndex: 0,
          editedText: null,
        }));
      if (!active) return;
      setCard(state);

      const snapshot = await repo.getSnapshot(occasionKey).catch(() => null);
      if (active) {
        setBlessings(snapshot?.blessings ?? null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = getCardTemplate(card?.templateCode);
  const selectedIndex = card?.selectedIndex ?? 0;
  // editedText 为空白时视为未编辑（T45 起用户可手写）
  const edited = card?.editedText?.trim() ? card.editedText : null;
  const wish = edited ?? blessings?.[selectedIndex] ?? null;
  const to = person ? (person.salutation?.trim() || person.name) : null;
  const sign = person?.signature?.trim() ? person.signature : null;

  const onSelectTemplate = async (code: string) => {
    if (!card || code === card.templateCode) return;
    // 乐观切换：立即响应，落库后以库内完整行回写（selectedIndex / editedText 不丢）
    setCard({ ...card, templateCode: code });
    const repo = await getRepository();
    const saved = await repo.upsertCardState({ ...occasionKey, templateCode: code });
    setCard(saved);
  };

  return (
    <Card>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.ink }}>
        电子贺卡
      </Text>

      <View style={{ marginTop: spacing.md }}>
        {card === null ? (
          // 自动组合读库中的占位：与成品同比例，避免布局跳动与模板闪烁
          <View
            style={{
              width: '100%',
              aspectRatio: CARD_ART_SIZE.width / CARD_ART_SIZE.height,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.mistDeep,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={colors.pine} />
          </View>
        ) : (
          <>
            <Postcard template={template} to={to} wish={wish} sign={sign} dateLabel={dateLabel} />

            {/* 切换条：左为当前模板名，右为三套缩略；不按日子分组 */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: spacing.md,
              }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.inkSoft }}>
                {template.name}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {CARD_TEMPLATES.map((tpl) => {
                  const selected = tpl.code === template.code;
                  return (
                    <Pressable
                      key={tpl.code}
                      accessibilityRole="button"
                      accessibilityLabel={`切换到${tpl.name}模板`}
                      onPress={() => onSelectTemplate(tpl.code)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <Image
                        source={tpl.art}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: radius.sm,
                          borderWidth: 2,
                          borderColor: selected ? colors.honey : 'transparent',
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.footnote,
                color: colors.inkFaint,
                textAlign: 'center',
                marginTop: spacing.sm,
              }}
            >
              贺卡已按模板自动摆好，切换模板不丢祝福
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
