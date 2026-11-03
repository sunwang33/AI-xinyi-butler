/**
 * 心意详情（plan 3.1 /occasion-detail）
 * query：kind=birthday|anniversary|festival（必填）、personId（节日通用版可空）、
 *       anniversaryId（anniversary 必填）、festivalCode（festival 必填，六代号之一）、
 *       year（必填整数，设备本地年份）。
 * M6/M7：祝福分区（告知门禁、生成、当年快照、复制、重试、重新生成）、
 *        礼物分区（不少于五个、去看看跳电商搜索）；通用版节日只含祝福与贺卡。
 * 电子贺卡、往年记录仍为占位，由后续里程碑填充。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, EmptyState, PageHeader, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
import {
  FESTIVAL_CODES,
  OCCASION_TYPES,
  type AiConsent,
  type Anniversary,
  type FestivalCode,
  type OccasionType,
  type Person,
  type Trait,
} from '../src/data/entities';
import { FESTIVALS } from '../src/features/occasions/festivals';
import { BlessingSection } from '../src/features/content/BlessingSection';
import { GiftSection } from '../src/features/content/GiftSection';
import { CardSection } from '../src/features/card/CardSection';
import { buildContentContext } from '../src/features/content/context';
import { ConsentSheet } from '../src/features/consent/ConsentSheet';
import { colors, fonts, fontSize, spacing } from '../src/theme/tokens';

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

/** 分区卡片：宋体小标题 + 内容（贺卡 / 往年记录占位继续用） */
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

/** 标题区所需的档案资料与设置（本轮起含特征、祝福条数、AI 告知状态） */
interface HeaderData {
  person: Person | null;
  anniversary: Anniversary | null;
  traits: Trait[];
  blessingCount: number;
  consent: AiConsent;
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
  const queryFestivalCode = params?.festivalCode ?? null;
  const queryYear = params?.year ?? null;
  // 当前查询的唯一标识；读取结果带上 key，query 变化期间自然呈现加载态
  const headerKey = `${queryKind ?? ''}|${queryPersonId ?? ''}|${queryAnniversaryId ?? ''}|${queryFestivalCode ?? ''}|${queryYear ?? ''}`;

  const [headerEntry, setHeaderEntry] = useState<{ key: string; data: HeaderData } | null>(null);
  // 读取失败时记录是哪个 query 失败的
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!queryKind || queryYear === null) {
      return;
    }
    let active = true;
    getRepository()
      .then(async (repo) => {
        // 称呼取 salutation，未填用 name；通用版节日不取人
        const person = queryPersonId ? await repo.getPerson(queryPersonId) : null;
        const traits = queryPersonId ? await repo.listTraits(queryPersonId) : [];
        let anniversary: Anniversary | null = null;
        if (queryKind === 'anniversary' && queryPersonId) {
          const list = await repo.listAnniversaries(queryPersonId);
          anniversary = list.find((item) => item.id === queryAnniversaryId) ?? null;
        }
        const settings = await repo.getSettings();
        if (active) {
          setHeaderEntry({
            key: headerKey,
            data: {
              person,
              anniversary,
              traits,
              blessingCount: settings.blessingCount,
              consent: settings.aiConsent,
            },
          });
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
  }, [queryKind, queryPersonId, queryAnniversaryId, headerKey, queryYear]);

  // 仅当已取到的数据属于当前 query 时才采用，否则视为加载中
  const header = headerEntry && headerEntry.key === headerKey ? headerEntry.data : null;
  const loadFailed = failedKey === headerKey;

  // ---- T28 首次 AI 生成告知门禁 ----
  // 同意状态以读取到的设置值为准；本页内同意 / 拒绝用 override 即时覆盖，
  // 不在 effect 里回写 state（避免级联渲染）
  const [consentOverride, setConsentOverride] = useState<AiConsent | null>(null);
  const consent: AiConsent | null = header ? (consentOverride ?? header.consent) : null;
  const [sheetVisible, setSheetVisible] = useState(false);
  const [agreeBusy, setAgreeBusy] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  /** 未同意先弹告知；同意后直接执行 */
  const ensureConsent = useCallback(
    (action: () => void) => {
      if (consent === 'agreed') {
        action();
        return;
      }
      pendingActionRef.current = action;
      setSheetVisible(true);
    },
    [consent],
  );

  const onAgree = async () => {
    setAgreeBusy(true);
    try {
      const repo = await getRepository();
      const settings = await repo.updateSettings({ aiConsent: 'agreed' });
      setConsentOverride(settings.aiConsent);
      setSheetVisible(false);
      pendingActionRef.current?.();
      pendingActionRef.current = null;
    } finally {
      setAgreeBusy(false);
    }
  };

  const onDecline = async () => {
    const repo = await getRepository();
    const settings = await repo.updateSettings({ aiConsent: 'declined' });
    setConsentOverride(settings.aiConsent);
    setSheetVisible(false);
    pendingActionRef.current = null;
  };

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
  const festivalName = params.kind === 'festival' ? occasionName : null;

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

  if (!header || consent === null) {
    return (
      <Screen scroll>
        <PageHeader title="心意详情" />
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.pine} />
        </View>
      </Screen>
    );
  }

  // 快照业务键与云函数入参
  const occasionKey = {
    occasionType: params.kind,
    personId: params.personId,
    anniversaryId: params.anniversaryId,
    festivalCode: params.festivalCode,
    year: params.year,
  };
  const contentContext = buildContentContext({
    occasionType: params.kind,
    person: header.person,
    traits: header.traits,
    anniversary: header.anniversary,
    festivalName,
    festivalCode: params.festivalCode ?? undefined,
    year: params.year,
  });

  // 贺卡左下角完整日期（YYYY年M月D日）：取今年这次日子的月日，年份用本次年份
  // （生日也只表示今年这次，不出现出生年/年龄，符合 spec 第 5 条）。
  let cardMonth = 0;
  let cardDay = 0;
  if (params.kind === 'birthday' && header.person) {
    cardMonth = header.person.birthdayMonth;
    cardDay = header.person.birthdayDay;
  } else if (params.kind === 'anniversary' && header.anniversary) {
    cardMonth = header.anniversary.month;
    cardDay = header.anniversary.day;
  } else if (params.kind === 'festival' && params.festivalCode) {
    const md = FESTIVALS.find((f) => f.code === params.festivalCode)?.dateOf(params.year).slice(5) ?? '';
    const [m, d] = md.split('-').map((v) => Number(v));
    cardMonth = m ?? 0;
    cardDay = d ?? 0;
  }
  const cardDateFull = cardMonth > 0 ? `${params.year}年${cardMonth}月${cardDay}日` : '';

  return (
    <Screen scroll>
      <PageHeader title={headerTitle} />
      <View style={{ paddingHorizontal: 2, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: fontSize.small, color: colors.inkSoft }}>{headerSubtitle}</Text>
      </View>

      <View style={{ gap: spacing.lg }}>
        {/* 分区一：祝福（M6） */}
        <BlessingSection
          occasionKey={occasionKey}
          context={contentContext}
          consent={consent}
          blessingCount={header.blessingCount}
          festivalName={festivalName}
          personId={params.personId}
          ensureConsent={ensureConsent}
        />

        {/* 分区二：礼物建议（M7）。spec 第 7 条：通用版节日只含祝福与贺卡，不渲染礼物分区 */}
        {!isGenericFestival ? (
          <GiftSection
            occasionKey={occasionKey}
            context={contentContext}
            consent={consent}
            festivalName={festivalName}
            ensureConsent={ensureConsent}
          />
        ) : null}

        {/* 分区三：电子贺卡（M9 T44：进入即自动组合、称呼落款规则、三套模板切换；
            T45 祝福切换与手写编辑、T46 导出保存分享随后接入）。
            key 取日子业务键：切换日子时整块重挂，贺卡状态自然回到加载/自动组合态。 */}
        <CardSection
          key={headerKey}
          occasionKey={occasionKey}
          person={header.person}
          dateFull={cardDateFull}
        />

        {/* 底部区位：今年已送出 / 往年记录（M11 / T50、T52 填充标记与往年倒序列表）。
            无往年记录时最终文案即「今年是第一次」（spec 第 12 条）。 */}
        <SectionCard title="今年已送出 · 往年记录">
          <SectionNote>今年是第一次</SectionNote>
        </SectionCard>
      </View>

      <ConsentSheet
        visible={sheetVisible}
        busy={agreeBusy}
        onAgree={onAgree}
        onDecline={onDecline}
      />
    </Screen>
  );
}
