/**
 * 添加 / 编辑人员表单（T11），create / edit 两态共用的受控组件。
 * 视觉只复用 src/components 与 tokens；数字字段用 TextField 数字键盘分月/日/年录入，
 * 不引入日期选择器。保存与差异同步逻辑在 usePersonForm。
 */
import { ReactNode } from 'react';
import { Alert, Keyboard, Text, View } from 'react-native';
import { RELATIONS } from '../../data/entities';
import { Button, Card, Chip, PageHeader, Screen, TextField } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { AnniversaryEditor, ErrorText } from './AnniversaryEditor';
import { TraitEditor } from './TraitEditor';
import { MAX_TRAITS } from './personFormSchema';
import { type PersonFormInitial, type PersonFormMode, usePersonForm } from './usePersonForm';

/** 卡片内分区小标题 */
function SectionTitle({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <Text
      style={{
        fontFamily: fonts.serif,
        fontSize: fontSize.rowTitle,
        color: colors.ink,
        marginBottom: spacing.md,
      }}
    >
      {children}
      {required ? <Text style={{ color: colors.honeyDeep, fontSize: fontSize.body }}>　必填</Text> : null}
    </Text>
  );
}

export function PersonForm({
  mode,
  initial,
  onSaved,
  onCancel,
  footer,
}: {
  mode: PersonFormMode;
  /** 编辑态必传：档案 + 已有纪念日 / 特征 */
  initial?: PersonFormInitial;
  onSaved: (personId: string) => void;
  /** 编辑态取消：返回查看态；不传时头部返回键走默认 router.back() */
  onCancel?: () => void;
  /** 编辑态底部附加区（删除此人入口由页面挂在这里） */
  footer?: ReactNode;
}) {
  const form = usePersonForm(mode, initial);
  const { values, errors, submitting } = form;

  /** 保存：校验不过给行内提示 + Alert；落库异常给失败提示 */
  const handleSave = async () => {
    Keyboard.dismiss();
    try {
      const person = await form.submit();
      if (!person) {
        Alert.alert('信息未填完整', '请填写姓名、与自己的关系和生日后再保存。');
        return;
      }
      onSaved(person.id);
    } catch {
      Alert.alert('保存失败', '请稍后重试。');
    }
  };

  return (
    <Screen scroll>
      <PageHeader title={mode === 'create' ? '添加人员' : '编辑人员'} onBack={onCancel} />

      {/* 基本信息 */}
      <Card style={{ marginBottom: spacing.lg }}>
        <SectionTitle required>基本信息</SectionTitle>

        <TextField
          label="姓名"
          required
          placeholder="TA 的姓名"
          value={values.name}
          onChangeText={form.setName}
        />
        <ErrorText message={errors.name} />

        <Text style={{ marginBottom: 6, fontSize: fontSize.body, color: colors.inkSoft }}>
          与自己的关系<Text style={{ color: colors.honeyDeep }}>　必填</Text>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
          {RELATIONS.map((r) => (
            <Chip key={r} title={r} selected={values.relation === r} onPress={() => form.setRelation(r)} />
          ))}
        </View>
        <ErrorText message={errors.relation} />

        <Text style={{ marginBottom: 6, fontSize: fontSize.body, color: colors.inkSoft }}>
          生日（月 / 日必填，出生年份选填）<Text style={{ color: colors.honeyDeep }}>　必填</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              small
              keyboardType="numeric"
              maxLength={2}
              placeholder="月"
              value={values.birthdayMonth}
              onChangeText={form.setBirthdayMonth}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              small
              keyboardType="numeric"
              maxLength={2}
              placeholder="日"
              value={values.birthdayDay}
              onChangeText={form.setBirthdayDay}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <TextField
              small
              keyboardType="numeric"
              maxLength={4}
              placeholder="出生年份（选填）"
              value={values.birthYear}
              onChangeText={form.setBirthYear}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <ErrorText message={errors.birthdayMonth} />
          </View>
          <View style={{ flex: 1 }}>
            <ErrorText message={errors.birthdayDay} />
          </View>
          <View style={{ flex: 1.4 }}>
            <ErrorText message={errors.birthYear} />
          </View>
        </View>
      </Card>

      {/* 纪念日 */}
      <Card style={{ marginBottom: spacing.lg }}>
        <SectionTitle>纪念日（可添加多个）</SectionTitle>
        {values.anniversaries.map((a, i) => (
          <AnniversaryEditor
            key={a.key}
            value={a}
            errors={errors.anniversaries?.[i]}
            onChange={(patch) => form.updateAnniversary(a.key, patch)}
            onRemove={() => form.removeAnniversary(a.key)}
          />
        ))}
        <Button title="＋ 添加纪念日" variant="ghost" size="sm" onPress={form.addAnniversary} />
      </Card>

      {/* 特征 */}
      <Card style={{ marginBottom: spacing.lg }}>
        <SectionTitle>特征描述（0–5 条，单条不超过 30 字）</SectionTitle>
        {values.traits.map((t, i) => (
          <TraitEditor
            key={t.key}
            value={t}
            index={i}
            error={errors.traits?.[i] || undefined}
            onChange={(content) => form.updateTrait(t.key, content)}
            onRemove={() => form.removeTrait(t.key)}
          />
        ))}
        <Button
          title="＋ 添加特征"
          variant="ghost"
          size="sm"
          disabled={values.traits.length >= MAX_TRAITS}
          onPress={form.addTrait}
        />
        <ErrorText message={errors.traitsLimit} />
        <Text style={{ marginTop: 6, fontSize: fontSize.footnote, color: colors.inkFaint }}>
          {values.traits.length >= MAX_TRAITS
            ? `最多填写 ${MAX_TRAITS} 条特征`
            : `还可添加 ${MAX_TRAITS - values.traits.length} 条；留空的特征不会保存`}
        </Text>
      </Card>

      {/* 称呼与自称 */}
      <Card style={{ marginBottom: spacing.xl }}>
        <SectionTitle>贺卡称呼（均选填）</SectionTitle>
        <TextField
          label="你怎么称呼 TA"
          placeholder="如：妈妈、老王（不填则用姓名）"
          value={values.salutation}
          onChangeText={form.setSalutation}
        />
        <TextField
          label="你的自称"
          placeholder="如：儿子小明、小王（不填则祝福不落款）"
          value={values.signature}
          onChangeText={form.setSignature}
        />
      </Card>

      <Button title="保存" block loading={submitting} onPress={handleSave} />
      {footer ? <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>{footer}</View> : null}
    </Screen>
  );
}
