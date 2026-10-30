/**
 * 当日清单页（plan 3.1 /day-list，query: date=YYYY-MM-DD[&payload=JSON]；T24，F2 修订）。
 *
 * 同一天多个日子合并为一条推送时，点击推送进入本页。合并提醒里各人提前天数 N 可不同、
 * 日子实际日期可不同，而 date 是「送达日」（日子前第 N 天），不能用它反算当天日子。
 * 因此有两条数据路径：
 * 1. 通知点击（主路径）：query 带 payload（ReminderPayload 序列化），直接渲染 payload.items；
 * 2. 直接深链 / 无有效 payload：以 date 为 from=to 用日子引擎反算兜底（含被关闭提醒的日子，
 *    清单展示当天所有日子，不做 disabled 过滤，spec 第 5 条）。
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState, ListRow, PageHeader, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
import type { Anniversary, Person } from '../src/data/entities';
import { computeHitsInRange, type OccasionHit } from '../src/features/occasions/engine';
import {
  buildFestivalSelectHref,
  buildOccasionHref,
} from '../src/features/occasions/routes';
import { parseReminderData, type ReminderItem } from '../src/features/reminders/navigation';
import { colors, fontSize, spacing } from '../src/theme/tokens';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 校验 YYYY-MM-DD 且为真实日历日期（拒绝 2026-13-01、2027-02-29 等） */
function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/** 2026-10-29 → 2026年10月29日 */
function formatReadableDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

/** 两个本地日期的自然日差（to - from） */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY,
  );
}

/** 头像底色按行轮换，与人员列表一致 */
const AVATAR_TONES = ['default', 'warm', 'night'] as const;

export default function DayListScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();

  const dateParam =
    typeof rawParams.date === 'string' && isValidDateString(rawParams.date.trim())
      ? rawParams.date.trim()
      : null;

  // 主路径：解析通知带来的 payload；缺失 / 损坏 / 非法时为 null，落到反算兜底
  const payload = useMemo(() => {
    if (typeof rawParams.payload !== 'string') {
      return null;
    }
    try {
      return parseReminderData(JSON.parse(rawParams.payload));
    } catch {
      return null;
    }
  }, [rawParams.payload]);

  // 头部展示的送达日：优先 query.date，缺失时用 payload 自带的送达日
  const displayDate = dateParam ?? payload?.date ?? null;
  const payloadItems: ReminderItem[] = payload?.items ?? [];
  const hasPayloadItems = payloadItems.length > 0;

  // 兜底路径（深链无 payload）：null 表示加载中；数组为反算出的当天命中
  const [hits, setHits] = useState<OccasionHit[] | null>(null);

  const load = useCallback(() => {
    // 有 payload 主路径时不触发任何反算与数据读取
    if (hasPayloadItems || !dateParam) {
      return;
    }
    let active = true;
    getRepository()
      .then(async (repo) => {
        // 取全部人员与各自纪念日（Promise.all 并发），再交引擎反算当天命中
        const persons: Person[] = await repo.listPersons();
        const anniversariesPerPerson = await Promise.all(
          persons.map((person) => repo.listAnniversaries(person.id)),
        );
        const anniversaries: Anniversary[] = anniversariesPerPerson.flat();
        const dayHits = computeHitsInRange({
          today: dateParam,
          from: dateParam,
          to: dateParam,
          persons,
          anniversaries,
        });
        if (active) {
          setHits(dayHits);
        }
      })
      .catch(() => {
        // 读取失败按空列表呈现，不白屏；下次聚焦页面会自动重试
        if (active) {
          setHits([]);
        }
      });
    return () => {
      active = false;
    };
  }, [hasPayloadItems, dateParam]);

  useFocusEffect(load);

  // ---- 送达日与 payload 都缺失：友好错误态，不白屏 ----
  if (!displayDate) {
    return (
      <Screen scroll>
        <PageHeader title="当天到达提醒的日子" />
        <EmptyState
          title="日期信息不完整"
          description="链接里没有有效的日期，暂时打不开当天清单。"
        />
      </Screen>
    );
  }

  // payload 主路径直接定行；否则等反算结果
  const rows: ReminderItem[] | OccasionHit[] = hasPayloadItems ? payloadItems : (hits ?? []);

  return (
    <Screen scroll>
      <PageHeader title="当天到达提醒的日子" />
      <View style={{ paddingHorizontal: 2, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: fontSize.small, color: colors.inkSoft }}>
          {formatReadableDate(displayDate)}
        </Text>
      </View>

      {!hasPayloadItems && hits === null ? (
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.pine} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState title="这天没有日子" description="当天没有生日、纪念日或内置节日。" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {rows.map((row, index) => {
            // 两类行统一取展示字段：payload 项自带；反算命中取 hit 字段
            const subjectName = row.subjectName;
            const titleText =
              subjectName !== null ? `${subjectName}　${row.title}` : row.title;
            const avatarText =
              subjectName !== null ? subjectName.slice(0, 1) : row.title.slice(0, 1);

            // 副文本：payload 路径展示日子实际日期与「还有 N 天」（按送达日现算）；
            // 反算路径行就在送达日当天，无需额外副文本
            let subtitle: string | undefined;
            if (hasPayloadItems) {
              const item = row as ReminderItem;
              const n = daysBetween(displayDate, item.occasionDate);
              subtitle =
                n >= 1
                  ? `${formatReadableDate(item.occasionDate)} · 还有 ${n} 天`
                  : formatReadableDate(item.occasionDate);
            }

            return (
              <ListRow
                key={`${row.occasionType}-${row.personId ?? ''}-${row.anniversaryId ?? ''}-${row.festivalCode ?? ''}-${row.year}`}
                avatar={avatarText}
                avatarTone={AVATAR_TONES[index % AVATAR_TONES.length]}
                title={titleText}
                subtitle={subtitle}
                showChevron
                onPress={() => {
                  // 节日条目 → 节日选人页（可在页内选人或看通用版）；其余 → 心意详情
                  if (row.occasionType === 'festival' && row.festivalCode) {
                    router.push(buildFestivalSelectHref(row.festivalCode, row.year));
                  } else {
                    router.push(buildOccasionHref(row));
                  }
                }}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}
