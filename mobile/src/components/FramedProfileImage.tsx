import { profileFrames } from '@/constants/designAssets';
import { molduraConhecida, molduras } from '@/constants/molduras';
import { ProfileArtwork } from '@/components/ProfileArtwork';
import { getGuardianFaceImage, normalizeBrainHexProfile } from '@/constants/profileImages';
import { getProfileShellPalette } from '@/utils/profileShellTheme';
import { FRAME_CANVAS_SIZE, getFrameLayout, getProfileFrameLayout } from '@/utils/profileFrameLayout';
import { useFonteDeImagem } from '@/hooks/useFonteDeImagem';
import { molduraRemota, ouvirMoldurasRemotas, retratoDasMoldurasRemotas } from '@/utils/moldurasRemotas';
import React, { useId, useSyncExternalStore } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = {
  profile: string | null | undefined;
  source?: ImageSourcePropType;
  size?: number;
  fit?: 'cover' | 'contain';
  label?: string;
  artworkTone?: boolean;
  /** Moldura equipada (`alunos.moldura_equipada`). Sem ela, ou com código sem imagem no banco nem no pacote, vale a do perfil. */
  moldura?: string | null;
};

export function FramedProfileImage({ profile, source: sourceBruta, size = 112, fit = 'cover', label, artworkTone = false, moldura }: Props) {
  // Foto privada do Storage (#195) vira URL assinada; enquanto isso, o rosto padrao.
  const source = useFonteDeImagem(sourceBruta);
  const rimId = `profile-rim-${useId().replace(/:/g, '')}`;
  const key = normalizeBrainHexProfile(profile) ?? 'mastermind';
  const palette = getProfileShellPalette(key);
  useSyncExternalStore(ouvirMoldurasRemotas, retratoDasMoldurasRemotas, retratoDasMoldurasRemotas);
  const extra = molduraRemota(moldura) ?? (molduraConhecida(moldura) ? molduras[moldura] : null);
  const { opening, photoSize: innerSize, photoLeft, photoTop } = extra ? getFrameLayout(extra.opening, size) : getProfileFrameLayout(key, size);
  return (
    <View accessible={Boolean(label)} accessibilityLabel={label} style={[styles.root, { width: size, height: size }, { pointerEvents: "none" }]}>
      <View style={{ position: 'absolute', left: photoLeft, top: photoTop, width: innerSize, height: innerSize, borderRadius: innerSize / 2, overflow: 'hidden', backgroundColor: palette.surface }}>
        {artworkTone && source ? <ProfileArtwork source={source} profile={profile} width={innerSize} /> : <Image source={source ?? getGuardianFaceImage(key)} resizeMode={fit} style={{ width: innerSize, height: innerSize }} accessible={false} />}
      </View>
      <Svg width={size} height={size} viewBox={`0 0 ${FRAME_CANVAS_SIZE} ${FRAME_CANVAS_SIZE}`} style={styles.frame} accessible={false}>
        <Defs>
          <LinearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fff2cb" />
            <Stop offset="0.26" stopColor={palette.accent} />
            <Stop offset="0.60" stopColor={palette.surface} />
            <Stop offset="0.82" stopColor={palette.accent} />
            <Stop offset="1" stopColor="#ffe4a3" />
          </LinearGradient>
        </Defs>
        <Circle cx={opening.x} cy={opening.y} r={opening.radius + 3} fill="none" stroke={`url(#${rimId})`} strokeWidth="6" />
        <Circle cx={opening.x} cy={opening.y} r={opening.radius} fill="none" stroke="#ffe7ae" strokeWidth="1" opacity="0.85" />
      </Svg>
      <Image source={extra?.source ?? profileFrames[key]} resizeMode="contain" style={[styles.frame, { width: size, height: size }]} accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', left: 0, top: 0 },
});
