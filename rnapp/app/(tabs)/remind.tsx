import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader, Button, EmptyState, Screen } from '../../src/components';
import { NextOccasionCard } from '../../src/features/home/NextOccasionCard';
import { OccasionRow } from '../../src/features/home/OccasionRow';
import { FestivalRow } from '../../src/features/home/FestivalRow';
import { FestivalManageSheet } from '../../src/features/home/FestivalManageSheet';
import { useUpcomingOccasions } from '../../src/features/home/useUpcomingOccasions';
import { formatTodayHeader } from '../../src/features/home/dateLabel';
import { colors, fonts, fontSize, radius, spacing } from '../../src/theme/tokens';

/**
 * 提醒 Tab（T65 返工，T66 接入 F11；spec 第 4/5 条 / 全局规则 5，原型 F5）：
 * 自上而下三段——①「下一位」主卡（最近一个生日/纪念日）；②提醒窗口（现 30 天口径，
 * 窗口大小 B 组待定）内的生日/纪念日列表，当天条目带蜜蜡点（见 OccasionRow）；
 * ③已关注通用节日倒计时区：行尾星标就地取关（确认后消失），标题「已关注 N 个 · 管理 ›」
 * 打开节日管理 Sheet（重新关注的唯一入口；管理字样为 2026-10-31 拍板的可点性增强）；全部取关时给引导。
 * 本页不放任何人员管理入口与完整人员名单（统一在联系人 Tab，D15）。
 * 三态：加载中骨架、读取失败错误态+重试；仅「完全没有人员档案」走整页引导空态
 * （跳联系人 Tab 添加）。有人员但窗口内无日子时不做空屏：近期日子区给空文案，
 * 节日区照常渲染——全部取关时仍可经 FestivalEmpty 的「重新关注节日」进入管理 Sheet
 * （F1 修复，spec 第 5 条：取关必须可恢复）。
 */

/** 分区标题（原型 .secttl）：宋体标题 + 斜体英文 + 苔绿分隔线，右侧可放操作区 */
function SectionTitle({ zh, en, action }: { zh: string; en: string; action?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 18,
        marginBottom: 10,
        marginHorizontal: 2,
      }}
    >
      <Text style={{ fontFamily: fonts.serif, fontSize: 16, color: colors.ink }}>{zh}</Text>
      <Text style={{ fontFamily: fonts.numItalic, fontSize: 12, color: colors.inkFaint }}>
        {en}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.sage }} />
      {action}
    </View>
  );
}

/** 加载中骨架：主卡 + 两行列表 + 节日区，静态占位不引动画依赖 */
function RemindSkeleton() {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View
        style={{
          height: 118,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.honeyWash,
          backgroundColor: colors.paper,
        }}
      />
      <SectionTitle zh="近期日子" en="birthday & anniversary" />
      {[0, 1, 2].map((i) => (
        <View
          key={`sk-row-${i}`}
          style={{
            height: 62,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.paper,
            marginBottom: spacing.md,
          }}
        />
      ))}
    </View>
  );
}

/**
 * 节日区空态（虚线卡片，两种）：
 * - 全部取关（followedCount=0）：说明 + 「重新关注节日」打开管理 Sheet；
 * - 仍有关注但窗口内无节日：仅说明文案。
 */
function FestivalEmpty({
  allUnfollowed,
  onManage,
}: {
  allUnfollowed: boolean;
  onManage: () => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.sage,
        borderRadius: radius.lg,
        backgroundColor: colors.paperDim,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, color: colors.inkFaint }}>
        {allUnfollowed ? '你已取消关注全部通用节日' : '近期没有临近的通用节日'}
      </Text>
      {allUnfollowed ? (
        <Button title="重新关注节日" variant="ghost" onPress={onManage} />
      ) : null}
    </View>
  );
}

export default function RemindScreen() {
  const router = useRouter();
  const { loading, personHits, festivalHits, followedCount, personsEmpty, error, reload, refresh } =
    useUpcomingOccasions();
  // 节日管理 Sheet（重新关注的唯一入口）
  const [manageVisible, setManageVisible] = useState(false);

  // 仅「完全没有人员档案」才走整页引导空态；有人员但窗口内无日子时节日区必须保留
  // （否则全部取关后「重新关注节日」与「已关注 N 个」管理入口均不可达，F1）
  const empty = !loading && !error && personsEmpty;
  const next = personHits[0] ?? null;

  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="提醒" subtitle={formatTodayHeader()} />

      {loading ? (
        <RemindSkeleton />
      ) : error ? (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState
            title="日子读取失败"
            description="本地档案暂时读不出来，可以重试一次。"
            action={<Button title="重试" onPress={reload} />}
          />
        </View>
      ) : empty ? (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState
            title="还没有惦记的人"
            description="先去联系人 Tab 添加一位惦记的人，日子近了会提前提醒你。"
            action={
              <Button title="去添加联系人" onPress={() => router.push('/(tabs)/contacts')} />
            }
          />
        </View>
      ) : (
        <>
          {/* ①「下一位」主卡：只取人员日子（主卡是否可取节日 B 组未拍板，不提前实现） */}
          {next ? (
            <View style={{ marginBottom: spacing.sm }}>
              <NextOccasionCard hit={next} />
            </View>
          ) : null}

          {/* ② 近期日子：30 天窗口内生日/纪念日，当天蜜蜡点样式在 OccasionRow 内；
              有人员但窗口内无日子时给空文案，分区与节日区照常保留（F1） */}
          <SectionTitle zh="近期日子" en="birthday & anniversary" />
          {personHits.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              {personHits.map((hit) => (
                <OccasionRow
                  key={`${hit.occasionType}-${hit.personId ?? ''}-${hit.anniversaryId ?? ''}-${hit.date}`}
                  hit={hit}
                />
              ))}
            </View>
          ) : (
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.body,
                color: colors.inkFaint,
                marginVertical: spacing.sm,
                marginHorizontal: 2,
              }}
            >
              提醒窗口内暂无临近的生日或纪念日。
            </Text>
          )}

          {/* ③ 通用节日区：只列已关注节日；星标就地取关，标题计数打开管理 Sheet */}
          <SectionTitle
            zh="通用节日"
            en="festivals"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="管理节日关注"
                hitSlop={8}
                onPress={() => setManageVisible(true)}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSize.small,
                    color: colors.inkFaint,
                  }}
                >
                  已关注 {followedCount} 个
                </Text>
                {/* 「管理 ›」明示入口可点（真机反馈纯计数太隐蔽，2026-10-31 拍板方案 A） */}
                <Text
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSize.small,
                    color: colors.pineDeep,
                  }}
                >
                  {' · 管理 ›'}
                </Text>
              </Pressable>
            }
          />
          {festivalHits.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              {festivalHits.map((hit) => (
                <FestivalRow
                  key={`${hit.occasionType}-${hit.festivalCode ?? ''}-${hit.date}`}
                  hit={hit}
                  onChanged={refresh}
                />
              ))}
            </View>
          ) : (
            <FestivalEmpty
              allUnfollowed={followedCount === 0}
              onManage={() => setManageVisible(true)}
            />
          )}
        </>
      )}

      {manageVisible ? (
        <FestivalManageSheet
          visible
          onClose={() => setManageVisible(false)}
          onChanged={refresh}
        />
      ) : null}
    </Screen>
  );
}
