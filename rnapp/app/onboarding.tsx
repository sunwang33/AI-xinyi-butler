import { PlaceholderScreen } from '../src/components';

/** 添加引导：仅无任何档案时首次进入（plan 3.1 /onboarding） */
export default function OnboardingScreen() {
  return (
    <PlaceholderScreen
      title="添加引导"
      route="/onboarding"
      description="没有任何档案时首次进入 App 出现「把惦记的人，先记下来」引导页；按引导完成第一位人员添加后直接进入正常首页，已有档案后不再出现。"
      milestone="M3 · T14 实现"
    />
  );
}
