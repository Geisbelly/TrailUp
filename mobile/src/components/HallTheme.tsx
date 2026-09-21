import { coresDoDivisor } from '@/components/ornamentDividerColors';
import { publicScenery } from '@/constants/designAssets';
import { Design } from '@/styles/design';
import { getProfileShellPalette } from '@/utils/profileShellTheme';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import tinycolor from 'tinycolor2';

export type HallPalette = ReturnType<typeof getProfileShellPalette>;

/** Public scenery is separate from the quiet, profile-colored reading surfaces. */
export function HallBackground({ palette, height }: { palette: HallPalette; height?: number }) {
  return (
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, height ? { height } : null]}>
      <View style={styles.scenery}>
        {!palette.profile && <Image source={publicScenery} resizeMode="cover" style={styles.image} />}
        <LinearGradient
          colors={palette.profile ? [palette.surface, palette.background, palette.background] : [
            tinycolor(palette.background).setAlpha(0.45).toRgbString(),
            tinycolor(palette.background).setAlpha(0.7).toRgbString(),
            palette.background,
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

export function OrnamentDivider({ color, opacidade }: { color: string; opacidade?: number }) {
  const { dim, bright } = coresDoDivisor(color, opacidade);
  return (
    <View pointerEvents="none" accessible={false} style={styles.divider}>
      <View style={[styles.line, { backgroundColor: dim }]} />
      <Svg width={52} height={22} viewBox="0 0 52 22">
        <Path d="M26 1 L31 11 L26 21 L21 11 Z" fill={bright} />
        <Path d="M26 1 L26 21 L21 11 Z" fill={dim} />
        <Path d="M8 11 L12 7 L16 11 L12 15 Z M36 11 L40 7 L44 11 L40 15 Z" fill={dim} />
      </Svg>
      <View style={[styles.line, { backgroundColor: dim }]} />
    </View>
  );
}

export function Corner({ pos, color = Design.gold }: { pos: 'TL' | 'TR' | 'BL' | 'BR'; color?: string }) {
  const corner: ViewStyle = { position: 'absolute', width: 12, height: 12, borderColor: color };
  if (pos.startsWith('T')) { corner.top = 5; corner.borderTopWidth = 1; }
  else { corner.bottom = 5; corner.borderBottomWidth = 1; }
  if (pos.endsWith('L')) { corner.left = 5; corner.borderLeftWidth = 1; }
  else { corner.right = 5; corner.borderRightWidth = 1; }
  return <View pointerEvents="none" style={corner} />;
}

const styles = StyleSheet.create({
  scenery: { width: '100%', height: 460, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', minHeight: 26, marginVertical: 6 },
  line: { flex: 1, height: 1 },
});
