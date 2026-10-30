/**
 * 人员档案只读详情（T13）：展示内容与录入字段完全一致。
 * 顶部提供「编辑」入口，由页面切换到 PersonForm 编辑态（本页内切换，不外溢路由）。
 */
import { Text, View } from 'react-native';
import type { Anniversary, Person, Trait } from '../../data/entities';
import { Button, Card, Chip, PageHeader, Screen } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';

/** 信息行：左侧灰色字段名，右侧值；未填值显示「未填写」 */
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderBottomWidth: 1,
        borderBottomColor: colors.sageSoft,
      }}
    >
      <Text style={{ width: 76, fontSize: fontSize.body, color: colors.inkSoft }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: fontSize.base, color: empty ? colors.inkFaint : colors.ink }}>
        {empty ? '未填写' : value}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.rowTitle, color: colors.ink, marginBottom: spacing.sm }}>
      {children}
    </Text>
  );
}

export function PersonDetail({
  person,
  anniversaries,
  traits,
  onEdit,
}: {
  person: Person;
  anniversaries: Anniversary[];
  traits: Trait[];
  onEdit: () => void;
}) {
  const sortedAnniversaries = [...anniversaries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sortedTraits = [...traits].sort((a, b) => a.position - b.position);

  return (
    <Screen scroll>
      <PageHeader title="人员档案" />

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.sm }}>
        <Button title="编辑" variant="ghost" size="sm" onPress={onEdit} />
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title2, color: colors.ink }}>{person.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          <Chip title={person.relation} selected />
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <InfoRow label="生日" value={`${person.birthdayMonth}月${person.birthdayDay}日`} />
          <InfoRow
            label="出生年份"
            value={person.birthYear === null ? null : `${person.birthYear} 年`}
          />
          <InfoRow label="称呼 TA" value={person.salutation} />
          <InfoRow label="你的自称" value={person.signature} />
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <SectionTitle>纪念日</SectionTitle>
        {sortedAnniversaries.length === 0 ? (
          <Text style={{ fontSize: fontSize.body, color: colors.inkFaint }}>未添加</Text>
        ) : (
          sortedAnniversaries.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: spacing.md,
                paddingVertical: spacing.sm + 2,
                borderBottomWidth: 1,
                borderBottomColor: colors.sageSoft,
              }}
            >
              <Text style={{ fontSize: fontSize.base, color: colors.ink }}>{a.name}</Text>
              <Text style={{ fontSize: fontSize.body, color: colors.inkSoft }}>
                {a.month}月{a.day}日
                {a.startYear !== null ? `（${a.startYear} 年起）` : ''}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: spacing.xl }}>
        <SectionTitle>特征描述</SectionTitle>
        {sortedTraits.length === 0 ? (
          <Text style={{ fontSize: fontSize.body, color: colors.inkFaint }}>未添加</Text>
        ) : (
          sortedTraits.map((t) => (
            <Text
              key={t.id}
              style={{
                fontSize: fontSize.base,
                color: colors.ink,
                paddingVertical: spacing.sm + 2,
                borderBottomWidth: 1,
                borderBottomColor: colors.sageSoft,
              }}
            >
              · {t.content}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}
