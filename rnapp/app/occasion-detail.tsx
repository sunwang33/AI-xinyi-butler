/**
 * 心意详情（plan 3.1 /occasion-detail，T25 页壳）
 * query：kind=birthday|anniversary|festival（必填）、personId（节日通用版可空）、
 *       anniversaryId（anniversary 必填）、festivalCode（festival 必填，六代号之一）、
 *       year（必填整数，设备本地年份）。
 * 本轮只搭壳：标题区 + 祝福 / 礼物建议 / 电子贺卡三分区占位 + 底部往年记录区位；
 * 祝福区先放「需要网络」提示与「手动重试」占位按钮，内容由 M6 之后逐段填满。
 * 通用版节日（kind=festival 且无 personId）只含祝福与贺卡，不渲染礼物分区。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, EmptyState, PageHeader, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
import {
  FESTIVAL_CODES,
  OCCASION_TYPES,
  type Anniversary,
  type FestivalCode,
  type OccasionType,
  type Person,
} from '../src/data/entities';
// T15（M4-A，并行开发）提供六个内置节日常量表 FESTIVALS（含固定中文展示名）；
// 该模块落地前 typecheck 会报找不到本模块，属并行预期，本文件不自建节日映射。
import { FESTIVALS } from '../src/features/occasions/festivals';
import { colors, fonts, fontSize, radius, spacing } from '../src/theme/tokens';

/** 校验通过后的日子定位参数 */
interface OccasionParams {
  kind: OccasionType;
  /** 通用版节日时为 null */
  personId: string | null;
  /** 仅 anniversary 有值 */
  anniversaryId: string | null;
  /** 仅 festival 有值 */
  festivalCode: FestivalCode | null;
  year: number;
}

/** 取 query 中的第一个非空字符串；数组或缺席返回 null */
function firstString(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 解析并校验 query；缺失 / 非法时返回 null，页面走错误 EmptyState，不白屏 */
function parseParams(raw: Record<string, string | string[] | undefined>): OccasionParams | null {
  const kind = firstString(raw.kind);
  const personId = firstString(raw.personId);
  const anniversaryId = firstString(raw.anniversaryId);
  const festivalCodeRaw = firstString(raw.festivalCode);
  const yearRaw = firstString(raw.year);

  // kind 必填且为三枚举之一
  if (!kind || !(OCCASION_TYPES as readonly string[]).includes(kind)) {
    return null;
  }
  // year 必填整数（设备本地年份）
  if (!yearRaw || !/^-?\d+$/.test(yearRaw)) {
    return null;
  }
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) {
    return null;
  }

  if (kind === 'birthday') {
    // 生日必须有人
    if (!personId) {
      return null;
    }
    return { kind, personId, anniversaryId: null, festivalCode: null, year };
  }

  if (kind === 'anniversary') {
    // 纪念日必须有人且带 anniversaryId
    if (!personId || !anniversaryId) {
      return null;
    }
    return { kind, personId, anniversaryId, festivalCode: null, year };
  }

  // 节日：festivalCode 必须为六代号之一；personId 可空（空即通用版）
  if (!festivalCodeRaw || !(FESTIVAL_CODES as readonly string[]).includes(festivalCodeRaw)) {
    return null;
  }
  return {
    kind: 'festival',
    personId,
    anniversaryId: null,
    festivalCode: festivalCodeRaw as FestivalCode,
    year,
  };
}

/** 分区卡片：宋体小标题 + 内容（各分区内容 M6–M11 填充） */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.ink }}>{title}</Text>
      <View style={{ marginTop: spacing.md }}>{children}</View>
    </Card>
  );
}

/** 分区内的灰色说明文案 */
function SectionNote({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: 22, color: colors.inkSoft }}>
      {children}
    </Text>
  );
}

export default function OccasionDetailScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();
  // 参数非法时 params 为 null，直接走错误态，不再触发任何数据读取
  const params = parseParams(rawParams as Record<string, string | string[] | undefined>);

  // 拆出原始查询字段：params 每次渲染为新对象，按原始字段作依赖，query 不变则不重复读取
  const queryKind = params?.kind ?? null;
  const queryPersonId = params?.personId ?? null;
  const queryAnniversaryId = params?.anniversaryId ?? null;
  // 当前查询的唯一标识；读取结果带上 key，query 变化期间自然呈现加载态
  const headerKey = `${queryKind ?? ''}|${queryPersonId ?? ''}|${queryAnniversaryId ?? ''}`;

  // 标题区所需资料（只读 person / anniversary；本轮不读快照），按 headerKey 对应
  const [headerEntry, setHeaderEntry] = useState<{
    key: string;
    data: { person: Person | null; anniversary: Anniversary | null };
  } | null>(null);
  // 读取失败时记录是哪个 query 失败的
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!queryKind) {
      return;
    }
    let active = true;
    getRepository()
      .then(async (repo) => {
        // 称呼取 salutation，未填用 name；通用版节日不取人
        const person = queryPersonId ? await repo.getPerson(queryPersonId) : null;
        let anniversary: Anniversary | null = null;
        if (queryKind === 'anniversary' && queryPersonId) {
          const list = await repo.listAnniversaries(queryPersonId);
          anniversary = list.find((item) => item.id === queryAnniversaryId) ?? null;
        }
        if (active) {
          setHeaderEntry({ key: headerKey, data: { person, anniversary } });
        }
      })
      .catch(() => {
        // 只读失败也不白屏，落到错误 EmptyState
        if (active) {
          setFailedKey(headerKey);
        }
      });
    return () => {
      active = false;
    };
  }, [queryKind, queryPersonId, queryAnniversaryId, headerKey]);

  // 仅当已取到的数据属于当前 query 时才采用，否则视为加载中
  const header = headerEntry && headerEntry.key === headerKey ? headerEntry.data : null;
  const loadFailed = failedKey === headerKey;

  // 手动重试占位：T25 壳阶段不绑真实逻辑、不发起网络请求、不写任何数据。
  // TODO(M6)：T31 在此接入祝福快照生成——T28 首次 AI 告知同意后调用 T30 Edge Function，
  // 按「人 × 日子 × 年份」写 content_snapshots.blessings 当年固定；
  // 无网络 / 失败重试与连续 3 次通用兜底见 T34；T32/T33 补展示复制与重新生成。
  const handleRetryBlessings = () => {};

  // ---- 参数非法：友好错误态 + 返回按钮 ----
  if (!params) {
    return (
      <Screen scroll>
        <PageHeader title="心意详情" />
        <EmptyState
          title="日子信息不完整"
          description="链接里缺少必要的日子信息，暂时打不开这份心意。"
          action={
            <Button title="返回上一页" variant="ghost" onPress={() => router.back()} />
          }
        />
      </Screen>
    );
  }

  // ---- 日子名：生日固定文案；纪念日取档案中的自定义名；节日取 T15 常量表 ----
  const occasionName =
    params.kind === 'birthday'
      ? '生日'
      : params.kind === 'anniversary'
        ? (header?.anniversary?.name ?? '纪念日')
        : (FESTIVALS.find((f) => f.code === params.festivalCode)?.name ?? '节日');

  const isGenericFestival = params.kind === 'festival' && !params.personId;
  // 通用版节日无称呼；取不到 person 记录（如已删除）时以「TA」兜底
  const personLabel = header?.person ? (header.person.salutation ?? header.person.name) : null;
  const headerTitle = personLabel
    ? `${personLabel}的${occasionName}`
    : isGenericFestival
      ? occasionName
      : `TA 的${occasionName}`;
  const headerSubtitle = isGenericFestival
    ? `通用节日（未指定人） · ${params.year} 年`
    : `${params.year} 年`;

  // ---- 数据读取中 / 读取失败 ----
  if (loadFailed) {
    return (
      <Screen scroll>
        <PageHeader title="心意详情" />
        <EmptyState
          title="内容暂时打不开"
          description="本地数据读取失败，请稍后再试。"
          action={<Button title="返回上一页" variant="ghost" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (!header) {
    return (
      <Screen scroll>
        <PageHeader title="心意详情" />
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.pine} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PageHeader title={headerTitle} />
      <View style={{ paddingHorizontal: 2, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: fontSize.small, color: colors.inkSoft }}>{headerSubtitle}</Text>
      </View>

      <View style={{ gap: spacing.lg }}>
        {/* 分区一：祝福（M6 填内容）。本轮无快照，按 spec 第 8 条先展示「需要网络」提示与手动重试占位 */}
        <SectionCard title="祝福">
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.sage,
              borderRadius: radius.md,
              backgroundColor: colors.paperDim,
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.base, color: colors.pineDeep }}>
              需要网络
            </Text>
            <SectionNote>祝福还没生成，联网后会在这里自动准备好；现在没网，也可以点下方按钮手动重试。</SectionNote>
            <View style={{ marginTop: spacing.sm, flexDirection: 'row' }}>
              <Button title="手动重试" variant="ghost" size="sm" onPress={handleRetryBlessings} />
            </View>
          </View>
        </SectionCard>

        {/* 分区二：礼物建议（M7 / T37、T38 填充：不少于五个建议、「为什么适合 TA」与「去看看」）。
            spec 第 7 条：通用版节日只含祝福与贺卡，故此处不渲染礼物分区。 */}
        {!isGenericFestival ? (
          <SectionCard title="礼物建议">
            <SectionNote>
              礼物建议稍后上线。届时这里会列出不少于五个建议，每条都会说明为什么适合 TA，并可一键「去看看」。
            </SectionNote>
          </SectionCard>
        ) : null}

        {/* 分区三：电子贺卡（M9 / T44–T46 填充：进入即自动组合、模板切换、祝福切换与编辑、导出图片） */}
        <SectionCard title="电子贺卡">
          <SectionNote>电子贺卡稍后上线。进入本页时贺卡即自动组合好，可切换模板、选用祝福并导出成图片分享。</SectionNote>
        </SectionCard>

        {/* 底部区位：今年已送出 / 往年记录（M11 / T50、T52 填充标记与往年倒序列表）。
            无往年记录时最终文案即「今年是第一次」（spec 第 12 条）。 */}
        <SectionCard title="今年已送出 · 往年记录">
          <SectionNote>今年是第一次</SectionNote>
        </SectionCard>
      </View>
    </Screen>
  );
}
