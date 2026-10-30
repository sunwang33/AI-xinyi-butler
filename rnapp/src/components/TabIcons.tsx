import Svg, { Circle, Path } from 'react-native-svg';

/**
 * 底部标签栏图标，线条路径与 design/prototype.html .tabbar 四个 tab 图标一致：
 * 提醒（铃铛）、联系人（人像）、历史（时钟）、设置（齿轮）。
 */
export function RemindIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <Path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function ContactsIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={12} cy={8} r={3.4} />
      <Path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function HistoryIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3.5 2" />
    </Svg>
  );
}

export function GearIcon({ color, size = 23 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
      <Circle cx={12} cy={12} r={3.2} />
      <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </Svg>
  );
}
