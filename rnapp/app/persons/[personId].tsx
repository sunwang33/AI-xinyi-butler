import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, Screen } from '../../src/components';
import { colors, fonts, fontSize } from '../../src/theme/tokens';
import { getRepository } from '../../src/data/repository';
import type { Anniversary, Person, Trait } from '../../src/data/entities';
import { PersonDetail } from '../../src/features/persons/PersonDetail';
import { PersonForm } from '../../src/features/persons/PersonForm';
import { DeletePersonSheet } from '../../src/features/persons/DeletePersonSheet';
// M5 调度器：删除人员后重算提醒（当前为空桩，失败不阻断）
import { rescheduleReminders } from '../../src/features/reminders/scheduler';

/**
 * 查看 / 编辑人员（plan 3.1 /persons/[personId]；T11 编辑态 + T13）
 * 默认只读档案；页内切换编辑态复用 PersonForm，编辑态底部放「删除此人」入口，
 * 删除走 DeletePersonSheet 二次确认，确认后事务级联删除并重算提醒。
 */
export default function PersonDetailScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const router = useRouter();

  const [person, setPerson] = useState<Person | null>(null);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  // 读取抛错（如数据库异常）：进入错误态并提供重试，避免一直转圈
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  // 每次进入编辑态递增，强制 PersonForm 用最新数据重建内部表单状态
  const formSeq = useRef(0);
  const [formKey, setFormKey] = useState(0);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 读取档案；失败进入错误态，重试按钮重新执行本函数
  const fetchPerson = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const repo = await getRepository();
      const [p, annis, ts] = await Promise.all([
        repo.getPerson(id),
        repo.listAnniversaries(id),
        repo.listTraits(id),
      ]);
      setPerson(p);
      setAnniversaries(annis);
      setTraits(ts);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 进页 / 返回本页自动刷新（与人员列表同一模式）
  useFocusEffect(
    useCallback(() => {
      if (!personId) return;
      let active = true;
      setLoading(true);
      setLoadError(false);
      void getRepository()
        .then((repo) =>
          Promise.all([repo.getPerson(personId), repo.listAnniversaries(personId), repo.listTraits(personId)]),
        )
        .then(([p, annis, ts]) => {
          if (!active) return;
          setPerson(p);
          setAnniversaries(annis);
          setTraits(ts);
          setLoadError(false);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setLoadError(true);
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [personId]),
  );

  const reload = fetchPerson;

  const enterEdit = () => {
    formSeq.current += 1;
    setFormKey(formSeq.current);
    setEditing(true);
  };

  /** 编辑保存成功：重新读库后回到只读态，详情即最新 */
  const handleSaved = async (id: string) => {
    setLoading(true);
    await reload(id);
    setEditing(false);
  };

  /** 确认删除：级联删除 → 重算提醒（失败不阻断）→ 回人员列表 */
  const handleConfirmDelete = async () => {
    if (!personId || deleting) return;
    setDeleting(true);
    try {
      const repo = await getRepository();
      await repo.deletePerson(personId);
      await Promise.resolve(rescheduleReminders()).catch(() => {});
      setDeleteVisible(false);
      router.replace('/(tabs)/contacts');
    } catch {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.pine} />
          <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, color: colors.inkSoft }}>加载中…</Text>
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen scroll>
        <EmptyState
          title="档案读取失败"
          description="数据读取时出现问题，请重试。"
          action={
            personId ? (
              <Button title="重试" onPress={() => void fetchPerson(personId)} />
            ) : (
              <Button title="返回人员列表" variant="ghost" onPress={() => router.replace('/(tabs)/contacts')} />
            )
          }
        />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen scroll>
        <EmptyState
          title="人员不存在或已删除"
          action={<Button title="返回人员列表" variant="ghost" onPress={() => router.replace('/(tabs)/contacts')} />}
        />
      </Screen>
    );
  }

  if (editing) {
    return (
      <>
        <PersonForm
          key={formKey}
          mode="edit"
          initial={{ person, anniversaries, traits }}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
          footer={
            <Button
              title="删除此人"
              variant="ghost"
              style={{ borderColor: colors.honey }}
              onPress={() => setDeleteVisible(true)}
            />
          }
        />
        <DeletePersonSheet
          visible={deleteVisible}
          name={person.name}
          deleting={deleting}
          onCancel={() => setDeleteVisible(false)}
          onConfirm={handleConfirmDelete}
        />
      </>
    );
  }

  return (
    <PersonDetail person={person} anniversaries={anniversaries} traits={traits} onEdit={enterEdit} />
  );
}
