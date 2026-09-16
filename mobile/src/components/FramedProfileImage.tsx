import { profileFrames } from '@/constants/designAssets';
import { ProfileArtwork } from '@/components/ProfileArtwork';
import { getGuardianFaceImage, normalizeBrainHexProfile } from '@/constants/profileImages';
import { getProfileShellPalette } from '@/utils/profileShellTheme';
import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

type Props = {
  profile: string | null | undefined;
  source?: ImageSourcePropType;
  size?: number;
  fit?: 'cover' | 'contain';
  label?: string;
  artworkTone?: boolean;
};

export function FramedProfileImage({ profile, source, size = 112, fit = 'cover', label, artworkTone = false }: Props) {
  const key = normalizeBrainHexProfile(profile) ?? 'mastermind';
  const palette = getProfileShellPalette(key);
  const innerSize = size * 0.78;
  return (
    <View pointerEvents="none" accessible={Boolean(label)} accessibilityLabel={label} style={[styles.root, { width: size, height: size }]}>
      <View style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2, overflow: 'hidden', backgroundColor: palette.surface }}>
        {artworkTone && source ? <ProfileArtwork source={source} profile={profile} width={innerSize} /> : <Image source={source ?? getGuardianFaceImage(key)} resizeMode={fit} style={{ width: innerSize, height: innerSize }} accessible={false} />}
      </View>
      <Image source={profileFrames[key]} resizeMode="contain" style={[styles.frame, { width: size, height: size }]} accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', left: 0, top: 0 },
});
