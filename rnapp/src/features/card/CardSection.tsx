/**
 * 心意详情 · 电子贺卡分区（M9 T44；T45 接入祝福翻页与手写编辑）。
 *
 * - 进入即自动组合：首次打开若无 card_states，立即写入默认模板（mountain）+
 *   selected_index=0；页面上没有单独的「生成」按钮（spec 第 10 条）。
 * - 称呼取 salutation（未填用姓名）；落款取 signature，未填整块不显示；通用版节日无人员，二者皆无。
 * - 三套模板不按日子分组（B 组 2026-11-01 拍板），自由切换；切换只改 template_code，
 *   祝福选择与手写不丢失。
 * - 祝福文字只读当年快照（生成归祝福区，本分区不触发 AI）。T45：
 *   · 多条祝福可用艺术区下方纸脚的 ‹ n/N › 翻页，进页默认第一条，选择写 selected_index 并保留；
 *   · 点祝福文字或「点按文字可编辑」进手写弹层，保存写 edited_text，贺卡即时换成手写；
 *   · 手写后翻页箭头置灰——手写与 AI 文案互斥显示，回到 AI 必须在弹层里显式
 *     「用回第 n 条 AI 祝福」，绝不因误触翻页静默丢掉手写（呼应 A2「已手写不被覆盖」）；
 *   · 超长手写按 B 组结论软上限 80 字、超过 60 字提示并由 Postcard 自动缩小字号。
 *
 * 状态生命周期：父页面以日子业务键（headerKey）作为本分区的 key，切换日子时整块重挂、
 * state 自然回到初始加载态。因此挂载 effect 每个实例只跑一次，也不在 effect 体内同步
 * setState（避免级联渲染）；写库结果在 await 之后的微任务中回填。
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Button, Card, Sheet, TextField } from '../../components';
import type { CardState, OccasionKey, Person } from '../../data/entities';
import { getRepository } from '../../data/repository';
import { useBroadcastSnapshot } from '../content/snapshotBroadcast';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { Postcard } from './Postcard';
import {
  CARD_ART_SIZE,
  CARD_TEMPLATES,
  DEFAULT_CARD_TEMPLATE,
  getCardTemplate,
} from './templates';

/** 手写软上限：输入框硬顶（防极端长文撑爆版面），超过软上限后提示并自动缩字号 */
const WISH_HARD_MAX = 80;
/** 软上限：到此字数以上贺卡祝福改用更小字号档，输入框给出蜜蜡色提示 */
const WISH_SOFT_MAX = 60;

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
  // 当年祝福快照首屏值（挂载时从仓储读，离线可看）
  const [loadedBlessings, setLoadedBlessings] = useState<string[] | null>(null);
  // 同页「重新生成」落库后的最新快照（经广播通道推送），优先于首屏值
  const liveSnapshot = useBroadcastSnapshot(occasionKey);
  // 手写弹层与其草稿（草稿不直接改库，点保存才落库）
  const [editorVisible, setEditorVisible] = useState(false);
  const [draft, setDraft] = useState('');

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
        setLoadedBlessings(snapshot?.blessings ?? null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = getCardTemplate(card?.templateCode);
  const selectedIndex = card?.selectedIndex ?? 0;
  // editedText 为空白时视为未编辑
  const edited = card?.editedText?.trim() ? card.editedText : null;

  // 祝福以同页广播的最新快照为准，首屏回退到仓储读到的值
  const blessings = liveSnapshot?.blessings ?? loadedBlessings;

  // 快照条数变化（如重新生成后变少）时做下标兜底，避免取到 undefined；翻页/落库时顺带纠正
  const pageCount = blessings?.length ?? 0;
  const safeIndex = pageCount > 0 ? Math.min(selectedIndex, pageCount - 1) : 0;
  const aiWish = pageCount > 0 ? blessings![safeIndex] : null;
  const wish = edited ?? aiWish;
  const isHandwritten = edited !== null;
  // 手写态不允许翻页（见文件头规则）；不足两条也无页可翻
  const canPage = pageCount >= 2 && !isHandwritten;

  const to = person ? (person.salutation?.trim() || person.name) : null;
  const sign = person?.signature?.trim() ? person.signature : null;

  // 局部落库：乐观更新，仓储只 SET 传入字段，故模板/选择/手写三者互不覆盖
  const persist = async (patch: { selectedIndex?: number; editedText?: string | null }) => {
    if (!card) return;
    setCard({ ...card, ...patch });
    const repo = await getRepository();
    const saved = await repo.upsertCardState({
      ...occasionKey,
      templateCode: card.templateCode,
      ...patch,
    });
    setCard(saved);
  };

  const onSelectTemplate = async (code: string) => {
    if (!card || code === card.templateCode) return;
    // 乐观切换：立即响应，落库后以库内完整行回写（selectedIndex / editedText 不丢）
    setCard({ ...card, templateCode: code });
    const repo = await getRepository();
    const saved = await repo.upsertCardState({ ...occasionKey, templateCode: code });
    setCard(saved);
  };

  const goPage = (next: number) => {
    if (!canPage) return;
    const clamped = Math.max(0, Math.min(pageCount - 1, next));
    if (clamped === safeIndex) return;
    void persist({ selectedIndex: clamped });
  };

  const openEditor = () => {
    // 预填当前贺卡文字：手写则填手写，否则填当前这条 AI 原文，方便在其基础上微调
    setDraft(wish ?? '');
    setEditorVisible(true);
  };

  const saveDraft = () => {
    const text = draft.trim();
    // 空白保存等同于清除手写、回到 AI 原文（无 AI 则回到空引导）
    void persist({ editedText: text || null });
    setEditorVisible(false);
  };

  const revertToAi = () => {
    void persist({ editedText: null });
    setEditorVisible(false);
  };

  const draftLong = draft.trim().length > WISH_SOFT_MAX;

  // 艺术区下方白纸脚（原型 .pc-foot > .switcher）
  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
      {pageCount >= 2 ? (
        <>
          <PagerButton glyph="‹" disabled={!canPage || safeIndex === 0} onPress={() => goPage(safeIndex - 1)} />
          <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.inkSoft }}>
            {isHandwritten ? (
              '我的手写'
            ) : (
              <Text>
                <Text style={{ fontFamily: fonts.num, fontSize: fontSize.small, color: colors.ink, fontWeight: '600' }}>
                  {safeIndex + 1}
                </Text>
                <Text style={{ fontFamily: fonts.num, fontSize: fontSize.small }}> / {pageCount}</Text>
              </Text>
            )}
          </Text>
          <PagerButton
            glyph="›"
            disabled={!canPage || safeIndex === pageCount - 1}
            onPress={() => goPage(safeIndex + 1)}
          />
          <View style={{ width: 1, height: 16, backgroundColor: colors.line }} />
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="手写编辑祝福"
        onPress={openEditor}
        style={({ pressed }) => ({
          height: 26,
          paddingHorizontal: 11,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.sage,
          backgroundColor: colors.paper,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.footnote, color: colors.pineDeep }}>
          点按文字可编辑
        </Text>
      </Pressable>
    </View>
  );

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
            <Postcard
              template={template}
              to={to}
              wish={wish}
              sign={sign}
              dateLabel={dateLabel}
              onEditWish={openEditor}
              footer={footer}
            />

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

      {/* 手写祝福编辑弹层 */}
      <Sheet visible={editorVisible} title="手写祝福" onClose={() => setEditorVisible(false)}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="在这句文案上改，或清空后写你自己的祝福"
          multiline
          maxLength={WISH_HARD_MAX}
          style={{ minHeight: 104, textAlignVertical: 'top' }}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.md,
          }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.footnote, color: draftLong ? colors.honeyDeep : colors.inkFaint }}>
            {draftLong ? '较长，贺卡字号会自动缩小' : '保存后贺卡立刻换成你的手写体'}
          </Text>
          <Text
            style={{
              fontFamily: fonts.num,
              fontSize: fontSize.footnote,
              color: draftLong ? colors.honeyDeep : colors.inkFaint,
            }}
          >
            {draft.trim().length}/{WISH_HARD_MAX}
          </Text>
        </View>
        <Button title="保存到手写贺卡" block onPress={saveDraft} />
        {isHandwritten && pageCount > 0 ? (
          <Button
            title={`用回 AI 祝福（第 ${safeIndex + 1} 条）`}
            variant="ghost"
            size="sm"
            block
            style={{ marginTop: spacing.sm }}
            onPress={revertToAi}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

/** 纸脚翻页圆钮：原型 .switcher button（26 圆、苔绿描边、信纸白） */
function PagerButton({
  glyph,
  disabled,
  onPress,
}: {
  glyph: '‹' | '›';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={glyph === '‹' ? '上一条祝福' : '下一条祝福'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: colors.sage,
        backgroundColor: colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.num, fontSize: 14, lineHeight: 16, color: colors.pine }}>{glyph}</Text>
    </Pressable>
  );
}
