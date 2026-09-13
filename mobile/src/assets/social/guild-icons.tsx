import Svg, { Circle, Path } from "react-native-svg";

export function GuildIcon({ color = "#9db8ff", size = 28 }: { color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" fill="none"><Circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2"/><Path d="M9 21.5h14M11 18V13l5-3 5 3v5M14 21.5v-4h4v4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><Circle cx="16" cy="7" r="1.5" fill={color}/></Svg>;
}

export function AchievementIcon({ color = "#f4cf75", size = 24 }: { color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" fill="none"><Path d="M10 5h12v8c0 4-2.5 6-6 6s-6-2-6-6V5Z" stroke={color} strokeWidth="2"/><Path d="M10 9H6v2c0 3 2 5 5 5M22 9h4v2c0 3-2 5-5 5M16 19v5M11 27h10" stroke={color} strokeWidth="2" strokeLinecap="round"/></Svg>;
}
