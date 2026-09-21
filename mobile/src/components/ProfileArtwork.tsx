import { useId, useMemo } from "react";
import {
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Defs,
  FeColorMatrix,
  Filter,
  Image as SvgImage,
} from "react-native-svg";
import { getBrainHexConfig } from "@/constants/profileImages";
import { buildArtworkToneMatrix } from "@/utils/profileArtworkTone";

type Props = {
  source: ImageSourcePropType;
  profile?: string | null;
  color?: string;
  width: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
};

export function ProfileArtwork({
  source,
  profile,
  color,
  width,
  height = width,
  style,
  label,
}: Props) {
  const id = `profile-art-${useId().replace(/:/g, "")}`;
  const accent = color ?? getBrainHexConfig(profile ?? undefined).color;
  const values = useMemo(() => buildArtworkToneMatrix(accent), [accent]);
  return (
    <View
      pointerEvents="none"
      accessible={Boolean(label)}
      accessibilityLabel={label}
      style={[style, { width, height }]}
    >
      {/* Native SVG filters cache the rendered image; rebuild it when the profile tone changes. */}
      <Svg key={accent} width={width} height={height}>
        <Defs>
          <Filter id={id} x="0%" y="0%" width="100%" height="100%">
            <FeColorMatrix type="matrix" values={values} />
          </Filter>
        </Defs>
        <SvgImage
          href={source}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}
