/**
 * 节日选人页（plan 3.1 /festival/[festivalCode]/select，query: year；M8 T40）。
 * 从提醒页节日条目（FestivalRow）或节日推送（navigation.ts）进入。
 * 两条出路：
 * - 「看通用版（不选人）」→ occasion-detail（kind=festival、无 personId），只有祝福与贺卡；
 * - 选一位已录入的人 → 同一详情页带 personId，祝福 / 礼物 / 贺卡同时体现节日与 TA 的特征。
 * 列出全部人员（含被单独关闭提醒的人——listPersons 不按提醒设置过滤）；
 * 一个人都没录时通用版仍可直接进入，不出现空白页。
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, ListRow, PageHeader, Screen } from '../../../src/components';
import { getRepository } from '../../../src/data/repository';
import {
  FESTIVAL_CODES,
  type FestivalCode,
  type Person,
  type Trait,
} from '../../../src/data/entities';
import { FESTIVALS, festivalRuleLabel } from '../../../src/features/occasions/festivals';
import { buildOccasionHref } from '../../../src/features/occasions/routes';
import { colors, fonts, fontSize, spacing } from '../../../src/theme/tokens';

/** 头像底色按行轮换，与 PersonList / 原型三档一致 */
const AVATAR_TONES = ['default', 'warm', 'night'] as const;

/** 人员 + 其特征（副标题取特征摘要） */
interface PersonRow {
  person: Person;
  traits: Trait[];
}

/** 取 query 中的第一个非空字符串；数组或缺席返回 null */
function firstString(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 校验后的路由参数；非法时为 null */
interface SelectParams {
  festivalCode: FestivalCode;
  year: number;
}

function parseParams(raw: Record<string, string | string[] | undefined>): SelectParams | null {
  const code = firstString(raw.festivalCode);
  const yearRaw = firstString(raw.year);
  if (!code || !(FESTIVAL_CODES as readonly string[]).includes(code)) {
    return null;
  }
  if (!yearRaw || !/^-?\d+$/.test(yearRaw)) {
    return null;
  }
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) {
    return null;
  }
  return { festivalCode: code as FestivalCode, year };
}

/** 人员行副标题：取前两条特征概括；一条都没有时给真诚兜底文案（原型 F-选人） */
function traitSubtitle(traits: Trait[]): string {
  const texts = traits
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((t) => t.content.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (texts.length === 0) {
    return '未填写特征，也能生成通用但真诚的版本';
  }
  return texts.join('，');
}

export default function FestivalSelectScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();
  const params = parseParams(rawParams as Record<string, string | string[] | undefined>);

  // null = 加载中或读取失败（与 PersonList 同一套三态口径）
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(false);
    setRows(null);
    try {
      const repo = await getRepository();
      const persons = await repo.listPersons();
      // 含被单独关闭提醒的人：listPersons 返回全部档案，不读提醒开关、不过滤
      const withTraits = await Promise.all(
        persons.map(async (person) => ({ person, traits: await repo.listTraits(person.id) })),
      );
      setRows(withTraits);
    } catch {
      setRows(null);
      setLoadError(true);
    }
  }, []);

  // 进页（含从「添加人员」返回）自动刷新名单
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // 重名集合：与 PersonList 一致，同名者标题加「（关系）」后缀消歧
  const duplicatedNames = useMemo(() => {
    if (!rows) {
      return new Set<string>();
    }
    const counts = new Map<string, number>();
    rows.forEach(({ person }) => counts.set(person.name, (counts.get(person.name) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [rows]);

  // ---- 参数非法：友好错误态 + 返回，不白屏 ----
  if (!params) {
    return (
      <Screen scroll>
        <PageHeader title="节日心意" />
        <EmptyState
          title="节日信息不完整"
          description="链接里缺少节日或年份信息，暂时打不开这份心意。"
          action={<Button title="返回上一页" variant="ghost" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const festival = FESTIVALS.find((f) => f.code === params.festivalCode) ?? null;
  const dateStr = festival?.dateOf(params.year) ?? '';
  const [, monthStr, dayStr] = dateStr.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);
  const ruleLabel = festivalRuleLabel(params.festivalCode);
  const subtitle = Number.isFinite(month)
    ? `${params.year} 年 ${month} 月 ${day} 日${ruleLabel ? ` · ${ruleLabel}` : ''}`
    : `${params.year} 年`;

  /** 进入心意详情；personId 缺省即通用版（routes 自动省略该参数） */
  const openDetail = (personId: string | null) => {
    router.push(
      buildOccasionHref({
        occasionType: 'festival',
        personId,
        anniversaryId: null,
        festivalCode: params.festivalCode,
        year: params.year,
      }),
    );
  };

  // 出口二：具体的人。先判失败、再判加载、再判空，if/else 链让 rows 类型稳定窄化，
  // 三态都在通用版行下方呈现，均不挡通用版入口。
  let personsArea: ReactNode;
  if (loadError) {
    personsArea = (
      <EmptyState
        title="人员列表读取失败"
        description="本机数据暂时读不出来，也可以先看上面的通用版。"
        action={<Button title="重试" onPress={() => void reload()} />}
      />
    );
  } else if (rows === null) {
    personsArea = (
      <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  } else if (rows.length === 0) {
    personsArea = (
      <EmptyState
        title="还没有惦记的人"
        description="可以直接看上面的通用版；想为某个人定制，先添加一位在乎的人。"
        action={<Button title="添加人员" onPress={() => router.push('/persons/new')} />}
      />
    );
  } else {
    personsArea = (
      <>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.small,
            color: colors.inkFaint,
            marginHorizontal: 4,
            marginTop: 4,
          }}
        >
          或选一位惦记的人，内容会同时体现节日与 TA 的特征
        </Text>
        {rows.map(({ person, traits }, index) => (
          <ListRow
            key={person.id}
            avatar={person.name.slice(0, 1)}
            avatarTone={AVATAR_TONES[index % AVATAR_TONES.length]}
            title={duplicatedNames.has(person.name) ? `${person.name}（${person.relation}）` : person.name}
            subtitle={traitSubtitle(traits)}
            showChevron
            onPress={() => openDetail(person.id)}
          />
        ))}
      </>
    );
  }

  return (
    <Screen scroll>
      <PageHeader title={festival?.name ?? '节日心意'} />
      <View style={{ paddingHorizontal: 2, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: fontSize.small, color: colors.inkSoft }}>{subtitle}</Text>
      </View>

      <View style={{ gap: spacing.md }}>
        {/* 出口一：通用版（蜜蜡虚线行，无人时也是唯一主路径，始终可点） */}
        <ListRow
          dashed
          avatar="通"
          avatarTone="warm"
          title="看通用版（不选人）"
          subtitle="含通用祝福与贺卡，不含礼物建议"
          showChevron
          onPress={() => openDetail(null)}
        />

        {/* 出口二：具体的人（加载 / 失败 / 空名单三态见 personsArea） */}
        {personsArea}
      </View>
    </Screen>
  );
}
