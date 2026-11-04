/**
 * 心意详情 · 礼物建议分区（M7 T37/T38）。
 * 纯文字卡片（名称 + 为什么适合 TA）+「去看看」→ 平台选择 Sheet（淘宝/京东，D7 拍板）。
 * 礼物失败不兜底（B 组 2026-10-31 拍板）：保持「需要网络」+ 手动重试。
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Button, Card, Sheet } from '../../components';
import type { AiConsent, GiftSuggestion, OccasionKey } from '../../data/entities';
import { FavoriteToggle } from '../favorites/FavoriteToggle';
import type { FavoriteScope } from '../favorites/restore';
import type { FavoriteStateApi } from '../favorites/useFavorites';
import { SentToggle } from '../history/SentToggle';
import type { SentStateApi } from '../history/useSentRecords';
import { GIFT_PLATFORMS, openGiftSearch } from '../gift/link';
import { useOnline } from '../../lib/network';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import type { ContentContext } from './types';
import { useGeneratedContent } from './useGeneratedContent';
import { BoxNote, BoxTitle, DashedBox, NoticeBar } from './SectionParts';

export function GiftSection({
  occasionKey,
  context,
  consent,
  festivalName,
  ensureConsent,
  favoriteApi,
  favoriteScope,
  sentApi,
}: {
  occasionKey: OccasionKey;
  context: ContentContext;
  consent: AiConsent | null;
  festivalName: string | null;
  ensureConsent: (action: () => void) => void;
  /** M10：收藏状态与 toggle */
  favoriteApi: FavoriteStateApi;
  /** M10：本礼物所属的日子作用域 */
  favoriteScope: FavoriteScope;
  /** M11 T50：今年实际送出的礼物标记（同年只保留一个，换标记走更改确认） */
  sentApi: SentStateApi;
}) {
  const state = useGeneratedContent('gift', occasionKey, context, consent, {
    // 礼物固定向模型要 6 条（云函数忽略 count），count 仅为 hook 入参完整性
    count: 6,
    festivalName,
  });
  const [target, setTarget] = useState<GiftSuggestion | null>(null);
  const gifts = state.snapshot?.gifts ?? [];
  // T78：设备真断网（飞行模式/无连接）时即时提示并禁用生成；SNI 阻断不在此列
  const online = useOnline();

  const goShopping = async (platformCode: (typeof GIFT_PLATFORMS)[number]['code']) => {
    if (!target) return;
    const suggestion = target;
    setTarget(null);
    await openGiftSearch(platformCode, suggestion.search_term);
  };

  return (
    <Card>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.ink }}>
        礼物建议
      </Text>

      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        {gifts.length > 0 ? (
          <>
            {gifts.map((gift, index) => (
              <View
                key={`${gift.name}-${index}`}
                style={{
                  backgroundColor: colors.paperDim,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: spacing.md,
                }}
              >
                <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.rowTitle, color: colors.ink }}>
                  {gift.name}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: 22, color: colors.inkSoft, marginTop: 2 }}>
                  {gift.reason}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    {/* M11 T50：把实际送出的那个礼物标记送出；同年同类业务唯一，
                        标第二个会弹「用当前这条更改」确认（见 SentToggle） */}
                    <SentToggle
                      api={sentApi}
                      year={favoriteScope.key.year}
                      kind="gift"
                      payload={gift}
                    />
                    {/* M10：每个礼物建议可单独收藏（按名称＋理由＋搜索词去重） */}
                    <FavoriteToggle
                      api={favoriteApi}
                      scope={favoriteScope}
                      kind="gift"
                      payload={gift}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`去看看：${gift.name}`}
                    onPress={() => setTarget(gift)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: colors.sage,
                      borderRadius: radius.pill,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 5,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.small, color: colors.pineDeep }}>
                      去看看
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {!online ? (
              <NoticeBar>当前无网络，暂时不能重新生成；恢复网络后可继续，已有礼物建议可正常查看。</NoticeBar>
            ) : state.error ? (
              // 已有内容时重新生成失败：旧建议保留，但必须明确提示（spec 全局规则 3；礼物不兜底）
              <NoticeBar>
                {state.error.reason === 'ratelimit'
                  ? '请求有点频繁，仍保留上次的礼物建议，请稍后再试。'
                  : '网络暂时不给力，仍保留上次的礼物建议；联网后点「重新生成」再试。'}
              </NoticeBar>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button
                title="重新生成"
                variant="ghost"
                size="sm"
                loading={state.busy}
                disabled={!online}
                // 撤回同意后重新生成必须重新过告知门禁（T28：未同意不发送任何信息）
                onPress={() => ensureConsent(() => state.run())}
              />
            </View>
          </>
        ) : state.busy ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm }}>
            <ActivityIndicator color={colors.pine} />
            <BoxNote>正在挑选适合 TA 的礼物…</BoxNote>
          </View>
        ) : !online ? (
          // T78：设备本地无连接的即时离线态（区别于「需要网络」的请求失败重试态）
          <DashedBox>
            <BoxTitle>无网络连接</BoxTitle>
            <BoxNote>设备当前没有联网，暂时无法获取礼物建议。恢复网络后会自动继续，无需重启。</BoxNote>
          </DashedBox>
        ) : state.error || state.failedBefore ? (
          <DashedBox>
            <BoxTitle>需要网络</BoxTitle>
            <BoxNote>
              {state.error?.reason === 'ratelimit'
                ? '请求有点频繁，请稍等一会儿再试。'
                : '礼物建议还没生成成功，联网后点下方按钮重试。'}
            </BoxNote>
            <View style={{ marginTop: spacing.sm, flexDirection: 'row' }}>
              <Button title="手动重试" variant="ghost" size="sm" onPress={() => ensureConsent(() => state.run())} />
            </View>
          </DashedBox>
        ) : consent === 'agreed' ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color={colors.pine} />
          </View>
        ) : (
          <DashedBox>
            <BoxTitle>为 TA 挑礼物</BoxTitle>
            <BoxNote>
              由 AI 结合 TA 的特征与这个日子给出不少于五个方向，每个都说明为什么适合 TA，并可直接「去看看」。
            </BoxNote>
            <View style={{ marginTop: spacing.sm, flexDirection: 'row' }}>
              <Button
                title="生成礼物建议"
                size="sm"
                onPress={() => ensureConsent(() => state.run())}
              />
            </View>
          </DashedBox>
        )}
      </View>

      {/* A1④：每条建议一个「去看看」，点后选择平台 */}
      <Sheet visible={target !== null} title="去哪个平台搜？" onClose={() => setTarget(null)}>
        <View style={{ gap: spacing.sm }}>
          {GIFT_PLATFORMS.map((platform) => (
            <Pressable
              key={platform.code}
              accessibilityRole="button"
              onPress={() => goShopping(platform.code)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: colors.sage,
                borderRadius: radius.md,
                backgroundColor: colors.paperDim,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.base, color: colors.pineDeep }}>
                {platform.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </Card>
  );
}
