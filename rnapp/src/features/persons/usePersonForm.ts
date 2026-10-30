/**
 * 人员表单状态与提交（T11）
 *
 * create / edit 两态共用同一份状态与校验：
 * - create：createPerson 后批量 createAnniversary / createTrait（position 从 0 起）；
 * - edit：updatePerson 后对纪念日 / 特征做增量对比——新增、更新、删除
 *   （删除纪念日走 deleteAnniversary，其快照等清理由仓储层负责）。
 * 保存成功后触发一次提醒重算，重算失败不阻断保存（M5 scheduler，同期空桩）。
 */
import { useRef, useState } from 'react';
import type { Anniversary, Person, Trait } from '../../data/entities';
import { getRepository } from '../../data/repository';
// M5 调度器：当前为空桩，档案保存后触发重算，失败不阻断保存（T27 正式实现）
import { rescheduleReminders } from '../reminders/scheduler';
import {
  AnniversaryDraft,
  PersonFormErrors,
  PersonFormValues,
  TraitDraft,
  buildPersonPayload,
  validatePersonForm,
} from './personFormSchema';

export type PersonFormMode = 'create' | 'edit';

/** 编辑态的初始数据：档案 + 已有纪念日 + 已有特征 */
export interface PersonFormInitial {
  person: Person;
  anniversaries: Anniversary[];
  traits: Trait[];
}

function emptyForm(): PersonFormValues {
  return {
    name: '',
    relation: null,
    birthdayMonth: '',
    birthdayDay: '',
    birthYear: '',
    salutation: '',
    signature: '',
    anniversaries: [],
    traits: [],
  };
}

function fromInitial(initial: PersonFormInitial): PersonFormValues {
  const { person, anniversaries, traits } = initial;
  return {
    name: person.name,
    relation: person.relation,
    birthdayMonth: String(person.birthdayMonth),
    birthdayDay: String(person.birthdayDay),
    birthYear: person.birthYear === null ? '' : String(person.birthYear),
    salutation: person.salutation ?? '',
    signature: person.signature ?? '',
    anniversaries: [...anniversaries]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map<AnniversaryDraft>((a) => ({
        key: a.id,
        id: a.id,
        name: a.name,
        month: String(a.month),
        day: String(a.day),
        startYear: a.startYear === null ? '' : String(a.startYear),
      })),
    traits: [...traits]
      .sort((a, b) => a.position - b.position)
      .map<TraitDraft>((t) => ({ key: t.id, id: t.id, content: t.content })),
  };
}

export function usePersonForm(mode: PersonFormMode, initial?: PersonFormInitial) {
  const [values, setValues] = useState<PersonFormValues>(() =>
    mode === 'edit' && initial ? fromInitial(initial) : emptyForm(),
  );
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const keySeq = useRef(0);

  const nextKey = (prefix: string) => {
    keySeq.current += 1;
    return `${prefix}-${keySeq.current}`;
  };

  /** 只允许输入数字（数字键盘外仍可能粘贴非数字，这里统一过滤） */
  const digitsOnly = (text: string) => text.replace(/[^\d]/g, '');

  const setField = <K extends keyof PersonFormValues>(field: K, value: PersonFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
  };

  const setName = (text: string) => setField('name', text);
  const setRelation = (r: PersonFormValues['relation']) => setField('relation', r);
  const setBirthdayMonth = (text: string) => setField('birthdayMonth', digitsOnly(text));
  const setBirthdayDay = (text: string) => setField('birthdayDay', digitsOnly(text));
  const setBirthYear = (text: string) => setField('birthYear', digitsOnly(text));
  const setSalutation = (text: string) => setField('salutation', text);
  const setSignature = (text: string) => setField('signature', text);

  // ---------- 纪念日 ----------

  const addAnniversary = () => {
    setValues((v) => ({
      ...v,
      anniversaries: [
        ...v.anniversaries,
        { key: nextKey('anni'), name: '', month: '', day: '', startYear: '' },
      ],
    }));
  };

  const updateAnniversary = (key: string, patch: Partial<Omit<AnniversaryDraft, 'key' | 'id'>>) => {
    setValues((v) => ({
      ...v,
      anniversaries: v.anniversaries.map((a) => {
        if (a.key !== key) return a;
        return {
          ...a,
          ...patch,
          ...(patch.month !== undefined ? { month: digitsOnly(patch.month) } : {}),
          ...(patch.day !== undefined ? { day: digitsOnly(patch.day) } : {}),
          ...(patch.startYear !== undefined ? { startYear: digitsOnly(patch.startYear) } : {}),
        };
      }),
    }));
  };

  const removeAnniversary = (key: string) => {
    setValues((v) => ({ ...v, anniversaries: v.anniversaries.filter((a) => a.key !== key) }));
  };

  // ---------- 特征 ----------

  const addTrait = () => {
    setValues((v) => ({ ...v, traits: [...v.traits, { key: nextKey('trait'), content: '' }] }));
  };

  const updateTrait = (key: string, content: string) => {
    setValues((v) => ({
      ...v,
      traits: v.traits.map((t) => (t.key === key ? { ...t, content } : t)),
    }));
  };

  const removeTrait = (key: string) => {
    setValues((v) => ({ ...v, traits: v.traits.filter((t) => t.key !== key) }));
  };

  /** 提交：校验通过后落库；失败（含校验不通过）返回 null */
  const submit = async (): Promise<Person | null> => {
    const nextErrors = validatePersonForm(values);
    setErrors(nextErrors);
    const payload = buildPersonPayload(values);
    if (!payload) return null;

    setSubmitting(true);
    try {
      const repo = await getRepository();
      let person: Person;

      if (mode === 'create') {
        person = await repo.createPerson({
          name: payload.name,
          relation: payload.relation,
          birthdayMonth: payload.birthdayMonth,
          birthdayDay: payload.birthdayDay,
          birthYear: payload.birthYear,
          salutation: payload.salutation,
          signature: payload.signature,
        });
      } else {
        const personId = initial?.person.id;
        if (!personId) throw new Error('编辑态缺少人员 ID');
        person = await repo.updatePerson(personId, {
          name: payload.name,
          relation: payload.relation,
          birthdayMonth: payload.birthdayMonth,
          birthdayDay: payload.birthdayDay,
          birthYear: payload.birthYear,
          salutation: payload.salutation,
          signature: payload.signature,
        });
      }

      // 纪念日对比同步：旧有今无 → 删；带 id → 改；无 id → 增
      const oldAnniversaries = mode === 'edit' ? initial?.anniversaries ?? [] : [];
      const nextIds = new Set(payload.anniversaries.map((a) => a.id).filter((id): id is string => !!id));
      for (const old of oldAnniversaries) {
        if (!nextIds.has(old.id)) {
          await repo.deleteAnniversary(old.id);
        }
      }
      for (const item of payload.anniversaries) {
        if (item.id) {
          await repo.updateAnniversary(item.id, {
            name: item.name,
            month: item.month,
            day: item.day,
            startYear: item.startYear,
          });
        } else {
          await repo.createAnniversary({
            personId: person.id,
            name: item.name,
            month: item.month,
            day: item.day,
            startYear: item.startYear,
          });
        }
      }

      // 特征对比同步，position 一律按最终顺序从 0 重排
      const oldTraits = mode === 'edit' ? initial?.traits ?? [] : [];
      const nextTraitIds = new Set(payload.traits.map((t) => t.id).filter((id): id is string => !!id));
      for (const old of oldTraits) {
        if (!nextTraitIds.has(old.id)) {
          await repo.deleteTrait(old.id);
        }
      }
      await Promise.all(
        payload.traits.map((item, index) =>
          item.id
            ? repo.updateTrait(item.id, { content: item.content, position: index })
            : repo.createTrait({ personId: person.id, content: item.content, position: index }),
        ),
      );

      // 档案变更后重算提醒；失败不阻断保存（T27 与 scheduler 兜底）
      Promise.resolve(rescheduleReminders()).catch(() => {});
      return person;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    values,
    errors,
    submitting,
    setName,
    setRelation,
    setBirthdayMonth,
    setBirthdayDay,
    setBirthYear,
    setSalutation,
    setSignature,
    addAnniversary,
    updateAnniversary,
    removeAnniversary,
    addTrait,
    updateTrait,
    removeTrait,
    submit,
  };
}
