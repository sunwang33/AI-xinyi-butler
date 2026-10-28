import { PlaceholderScreen } from '../src/components';

/**
 * 心意详情（plan 3.1 /occasion-detail）
 * query：kind=birthday|anniversary|festival、personId（通用节日为空）、
 *       anniversaryId / festivalCode、year
 * M5（T25）先搭祝福 / 礼物建议 / 电子贺卡三部分占位壳，M6–M9 逐段填满。
 */
export default function OccasionDetailScreen() {
  return (
    <PlaceholderScreen
      title="心意详情"
      route="/occasion-detail?kind=&personId=&year="
      description="点开即三部分齐全：祝福（默认三条、可复制、可重新生成）、礼物建议（不少于五个、每条含「为什么适合 TA」与「去看看」）、电子贺卡（进入即自动组合好）；含「今年已送出」标记与往年记录区。通用版节日只含祝福与贺卡。"
      milestone="M5 搭壳 · M6–M9 填满"
    />
  );
}
