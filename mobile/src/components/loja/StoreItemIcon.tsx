import { storeIconKind } from "@/services/loja/storeTheme";
import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";

type Props = { effect?: string | null; color: string; size?: number };

export function StoreMarkIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessibilityLabel="Loja">
    <Path d="M8 20h32l-3-9H11l-3 9Z" fill={`${color}33`} stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
    <Path d="M8 20c0 3 2 5 5 5s5-2 5-5c0 3 2 5 5 5s5-2 5-5c0 3 2 5 5 5s5-2 5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    <Path d="M12 25v13h24V25M20 38V29h8v9" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
  </Svg>;
}

export function StoreItemIcon({ effect, color, size = 52 }: Props) {
  const kind = storeIconKind(effect);
  const stroke = color;
  const fill = `${color}22`;
  const common = { stroke, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessibilityLabel="Ícone do item">
      {kind === "deadline" ? <>
        <Rect x="8" y="11" width="32" height="29" rx="5" fill={fill} {...common} />
        <Line x1="8" y1="19" x2="40" y2="19" {...common} />
        <Line x1="16" y1="7" x2="16" y2="14" {...common} />
        <Line x1="32" y1="7" x2="32" y2="14" {...common} />
        <Line x1="24" y1="24" x2="24" y2="34" {...common} />
        <Line x1="19" y1="29" x2="29" y2="29" {...common} />
      </> : kind === "retry" ? <>
        <Path d="M35 19a13 13 0 1 0 2 10" {...common} />
        <Path d="M35 10v9h-9" {...common} />
        <Polygon points="24,20 26,25 31,25 27,28 29,33 24,30 19,33 21,28 17,25 22,25" fill={fill} {...common} />
      </> : kind === "format" ? <>
        <Rect x="7" y="14" width="11" height="20" rx="2" fill={fill} {...common} />
        <Rect x="21" y="9" width="11" height="25" rx="2" fill={fill} {...common} />
        <Rect x="35" y="17" width="6" height="17" rx="2" fill={fill} {...common} />
        <Path d="M18 24h3m11 0h3" {...common} />
        <Path d="m19 20 3 4-3 4m14-8 3 4-3 4" {...common} />
      </> : <>
        <Path d="M16 23a8 8 0 1 1 16 0c0 3-2 5-4 7H20c-2-2-4-4-4-7Z" fill={fill} {...common} />
        <Path d="M20 34h8m-7 4h6" {...common} />
        <Path d="M36 10v5m-2.5-2.5h5M11 14v3m-1.5-1.5h3" {...common} />
        <Circle cx="24" cy="23" r="2" fill={color} />
      </>}
    </Svg>
  );
}
