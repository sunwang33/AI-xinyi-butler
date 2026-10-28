import { PlaceholderScreen } from '../../src/components';

/** 添加人员（plan 3.1 /persons/new） */
export default function NewPersonScreen() {
  return (
    <PlaceholderScreen
      title="添加人员"
      route="/persons/new"
      description="录入姓名（必填）、关系（家人 / 挚友 / 客户 / 其他）、生日（月日必填、出生年份选填）、多个纪念日、0–5 条特征、称呼与自称；仅姓名与生日缺失时不可保存。"
      milestone="M3 · T11 实现"
    />
  );
}
