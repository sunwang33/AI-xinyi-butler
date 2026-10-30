import { useRouter } from 'expo-router';
import { PersonForm } from '../../src/features/persons/PersonForm';

/**
 * 添加人员（plan 3.1 /persons/new；T11 创建态）
 * 保存成功后：有上一页则返回（联系人 Tab / 引导页入口）；
 * 无栈（首次引导跳入）则落提醒 Tab，避免退出即白屏。
 */
export default function NewPersonScreen() {
  const router = useRouter();

  return (
    <PersonForm
      mode="create"
      onSaved={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/remind');
        }
      }}
    />
  );
}
