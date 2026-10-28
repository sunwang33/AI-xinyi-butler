import { PlaceholderScreen } from '../src/components';

/**
 * 当日清单页（plan 3.1 /day-list，query: date=YYYY-MM-DD）
 * 多个日子合并为一条推送时，点击推送进入本页。
 */
export default function DayListScreen() {
  return (
    <PlaceholderScreen
      title="今天该准备的心意"
      route="/day-list?date=YYYY-MM-DD"
      description="列出当天全部到达提醒时点的日子，可分别进入各日子的心意详情。同一天多个日子合并为一条推送，点击后落到本页。"
      milestone="M5 · T24 实现"
    />
  );
}
