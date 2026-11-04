/**
 * 心意详情 · 祝福分区（M6 T31–T34）。
 * 状态：生成入口（未同意告知）/ 生成中 / 需要网络重试 / 内容（复制、重新生成、无特征提示、兜底提示）。
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Button, Card } from '../../components';
import type { AiConsent, OccasionKey } from '../../data/entities';
import { FavoriteToggle } from '../favorites/FavoriteToggle';
import type { FavoriteScope } from '../favorites/restore';
import type { FavoriteStateApi } from '../favorites/useFavorites';
import { SentToggle } from '../history/SentToggle';
import type { SentStateApi } from '../history/useSentRecords';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { useOnline } from '../../lib/network';
import type { ContentContext } from './types';
import { useGeneratedContent } from './useGeneratedContent';
import { BoxNote, BoxTitle, DashedBox, NoticeBar } from './SectionParts';

export function BlessingSection({
  occasionKey,
  context,
  consent,
  blessingCount,
  festivalName,
  personId,
  ensureConsent,
  favoriteApi,
  favoriteScope,
  sentApi,
}: {
  occasionKey: OccasionKey;
  context: ContentContext;
  consent: AiConsent | null;
  blessingCount: number;
  festivalName: string | null;
  /** 通用版节日为 null，不显示「去补充特征」 */
  personId: string | null;
  /** 未同意时先弹告知，同意后执行传入的生成动作 */
  ensureConsent: (action: () => void) => void;
  /** M10：收藏状态与 toggle */
  favoriteApi: FavoriteStateApi;
  /** M10：本条祝福所属的日子作用域（定位键 ＋ 对象 / 日子名快照） */
  favoriteScope: FavoriteScope;
  /** M11 T50：今年已送出标记（通用版节日不渲染标记按钮，T51 引导先选人） */
  sentApi: SentStateApi;
}) {
  const router = useRouter();
  const state = useGeneratedContent('blessing', occasionKey, context, consent, {
    count: blessingCount,
    festivalName,
  });
  // T78：设备真断网（飞行模式/无连接）时即时提示并禁用生成；SNI 阻断不在此列
  const online = useOnline();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const blessings = state.snapshot?.blessings ?? [];
  const noTraits = personId !== null && context.person !== null && context.person.traits.length === 0;

  const onCopy = async (text: string, index: number) => {
    await Clipboard.setStringAsync(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1600);
  };

  return (
    <Card>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.ink }}>
        祝福
      </Text>

      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        {blessings.length > 0 ? (
          <>
            {!online ? (
              <NoticeBar>当前无网络，暂时不能重新生成；恢复网络后可继续，已有祝福可正常复制。</NoticeBar>
            ) : state.fallbackUsed ? (
              <NoticeBar>
                网络暂时不给力，这里先展示通用祝福；联网后点「重新生成」可获取贴合 TA 的版本。
              </NoticeBar>
            ) : state.error ? (
              // 已有内容时重新生成失败：旧内容保留（T34），但必须明确提示（spec 全局规则 3）
              <NoticeBar>
                {state.error.reason === 'ratelimit'
                  ? '请求有点频繁，仍保留上次的祝福，请稍后再试。'
                  : '网络暂时不给力，仍保留上次生成的祝福；联网后点「重新生成」再试。'}
              </NoticeBar>
            ) : null}

            {blessings.map((text, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: colors.paperDim,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: spacing.md,
                }}
              >
                <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.base, lineHeight: 24, color: colors.ink }}>
                  {text}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: spacing.sm,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onCopy(text, index)}
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
                      {copiedIndex === index ? '已复制' : '复制'}
                    </Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    {/* M11 T50：实际送出的那条标记已送出（同年同类唯一，再点确认撤销/更改）；
                        通用版节日无归属人，T51 在底部面板引导先选人 */}
                    {personId !== null ? (
                      <SentToggle
                        api={sentApi}
                        year={favoriteScope.key.year}
                        kind="blessing"
                        payload={{ text }}
                      />
                    ) : null}
                    {/* M10：每条祝福可单独收藏，同文案再点取消 */}
                    <FavoriteToggle
                      api={favoriteApi}
                      scope={favoriteScope}
                      kind="blessing"
                      payload={{ text }}
                    />
                  </View>
                </View>
              </View>
            ))}

            {noTraits ? (
              <DashedBox>
                <BoxTitle>让祝福更贴合 TA</BoxTitle>
                <BoxNote>TA 还没有特征描述。补充爱好、近况、性格等特征后重新生成，祝福会更像专门写给 TA 的。</BoxNote>
                <View style={{ marginTop: spacing.xs }}>
                  <Button
                    title="去补充特征"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(`/persons/${personId}`)}
                  />
                </View>
              </DashedBox>
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
            <BoxNote>正在为 TA 准备祝福…</BoxNote>
          </View>
        ) : !online ? (
          // T78：设备本地无连接的即时离线态（区别于「需要网络」的请求失败重试态）
          <DashedBox>
            <BoxTitle>无网络连接</BoxTitle>
            <BoxNote>设备当前没有联网，暂时无法生成祝福。恢复网络后会自动继续，无需重启。</BoxNote>
          </DashedBox>
        ) : state.error || state.failedBefore ? (
          <DashedBox>
            <BoxTitle>需要网络</BoxTitle>
            <BoxNote>
              {state.error?.reason === 'ratelimit'
                ? '请求有点频繁，请稍等一会儿再试。'
                : '祝福还没生成成功。联网后点下方按钮重试；连续多次失败时，会先展示一组通用祝福。'}
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
            <BoxTitle>为 TA 准备祝福</BoxTitle>
            <BoxNote>
              由 AI 结合 TA 的关系、特征与这个日子拟好 {blessingCount} 条可以直接发送的文案。首次使用需要你确认信息发送说明。
            </BoxNote>
            <View style={{ marginTop: spacing.sm, flexDirection: 'row' }}>
              <Button
                title="生成祝福"
                size="sm"
                onPress={() => ensureConsent(() => state.run())}
              />
            </View>
          </DashedBox>
        )}
      </View>
    </Card>
  );
}
