import { PlaceholderScreen } from '../../src/components';

/**
 * 查看 / 编辑人员（plan 3.1 /persons/[personId]）
 * 删除操作在编辑态进入，带二次确认并级联删除全部关联数据。
 */
export default function PersonDetailScreen() {
  return (
    <PlaceholderScreen
      title="查看 / 编辑人员"
      route="/persons/[personId]"
      description="查看与修改任意档案字段；编辑态提供删除入口，删除前二次确认，明确告知为该人物收藏的内容和往年心意记录也会一并删除，确认后级联清除。"
      milestone="M3 · T11 / T13 实现"
    />
  );
}
