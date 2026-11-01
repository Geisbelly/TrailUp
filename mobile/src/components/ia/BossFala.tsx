import React, { useEffect } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIA } from '@/context/IAContext';
import { FontFamily } from '@/styles/GlobalStyle';
import { cueDoBoss, duracaoDaFala } from '@/utils/bossFalas';
import type { ProfileShellPalette } from '@/utils/profileShellTheme';

type Props = {
  topicoId: number | null;
  itemKey?: string | null;
  arte: ImageSourcePropType;
  palette: ProfileShellPalette;
  /** Chip do topo: o balão flutua logo abaixo da linha, sem empurrar a tela. */
  flutuante?: boolean;
};

/**
 * Balão com a fala do boss (entrada, provocação, marcos de vida, alerta, contra-ataque, derrota),
 * preso ao chip e ao painel lateral da batalha. Some sozinho depois de dar tempo de ler, ou ao
 * toque. A arte é a do catálogo do perfil (`useContentBossVisual`), a mesma do chip.
 */
export function BossFala({ topicoId, itemKey = null, arte, palette, flutuante = false }: Props) {
  const { pendingCharacterCues, dismissCharacterCue } = useIA();
  const cue = cueDoBoss(pendingCharacterCues, topicoId, itemKey);
  const cueId = cue?.id ?? null;
  const duracao = cue ? duracaoDaFala(cue.message) : 0;

  useEffect(() => {
    if (!cueId) return;
    const timer = setTimeout(() => dismissCharacterCue(cueId), duracao);
    return () => clearTimeout(timer);
  }, [cueId, duracao, dismissCharacterCue]);

  if (!cue) return null;
  const quem = cue.speakerName ?? cue.title ?? 'Boss';
  return (
    <Pressable
      onPress={() => dismissCharacterCue(cue.id)}
      accessibilityRole="button"
      accessibilityLabel={`${quem}: ${cue.message}. Toque para fechar.`}
      accessibilityLiveRegion="polite"
      style={[
        styles.balao,
        flutuante && styles.flutuante,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
      ]}
    >
      <View style={[styles.arteWrap, { backgroundColor: palette.accentMuted }]}>
        <Image source={arte} style={styles.arte} resizeMode="contain" />
      </View>
      <View style={styles.texto}>
        <Text style={[styles.quem, { color: palette.accent }]} numberOfLines={1}>
          {quem}
        </Text>
        <Text style={[styles.fala, { color: palette.text }]}>{cue.message}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  balao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  flutuante: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 20, elevation: 6 },
  arteWrap: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  arte: { width: '100%', height: '100%' },
  texto: { flex: 1, gap: 2 },
  quem: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: '700' },
  fala: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20 },
});
