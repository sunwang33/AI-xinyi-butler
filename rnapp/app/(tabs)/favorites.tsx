import { AppHeader, EmptyState, Screen } from '../../src/components';

/**
 * 收藏（Tab 2 / spec 第 11 条）
 * M1 为骨架占位；M10（T48、T49）起集中列出已收藏的祝福、礼物与贺卡。
 */
export default function FavoritesScreen() {
  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="收藏夹" subtitle="保存的是收藏那一刻的完整内容，可离线再用" />
      <EmptyState
        title="收藏"
        description="未来这里集中展示全部收藏，区分祝福 / 礼物 / 贺卡，并标明为谁、为什么日子收藏；祝福可复制、礼物可「去看看」、贺卡可导出图片。（M10 实现）"
      />
    </Screen>
  );
}
