import { PlaceholderScreen } from '../../src/components';

/** 人员列表（plan 3.1 /persons）：全部已录入人员，重名时以关系标签区分 */
export default function PersonsScreen() {
  return (
    <PlaceholderScreen
      title="惦记的人"
      route="/persons"
      description="列出全部已录入人员，允许重名，重名时以关系标签区分显示（如「张伟（客户）」）；提供新建人员入口，点入可查看与修改档案。"
      milestone="M3 · T12 实现"
    />
  );
}
