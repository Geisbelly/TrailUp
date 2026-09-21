import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIA } from '@/context/IAContext';
import { useUsuario } from '@/context/SessaoContext';
import { useTrilha } from '@/context/TrilhaContext';
import { useContentBossVisual } from '@/hooks/useContentBossVisual';
import { bossVisuals } from '@/constants/bossVisuals';
import { getProfileShellPalette } from '@/utils/profileShellTheme';

export function BossVictoryModal() {
  const { pendingBattleVictories, dismissBattleVictory } = useIA();
  const { usuario } = useUsuario();
  const { perfil, classeAtual } = useTrilha();
  const victory = pendingBattleVictories.find((v) => v.userId === usuario?.id
    && classeAtual?.topicos.some((t) => t.id === v.state.topicoId));
  const state = victory?.state;
  const teacherArt = useContentBossVisual(state?.topicoId, state?.itemKey, state?.enemy.contentId);
  if (!victory || !state) return null;
  const palette = getProfileShellPalette(perfil);
  const artUrl = state.enemy.visual?.avatarUrl ?? state.enemy.avatarUrl;
  const artwork = teacherArt ?? (artUrl ? { uri: artUrl } : bossVisuals['boss-01']);
  const close = () => dismissBattleVictory(victory.id);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.accent }]}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>Parabéns!</Text>
            <Text style={[styles.subtitle, { color: palette.accentStrong }]}>Você derrotou o boss!</Text>
            <Image source={artwork} resizeMode="contain" style={styles.art} accessibilityLabel={`Ilustração de ${state.enemy.name}`} />
            <Text style={[styles.name, { color: palette.text }]}>{state.enemy.name}</Text>
            <Text style={[styles.message, { color: palette.textMuted }]}>{victory.message}</Text>
            <Pressable accessibilityRole="button" onPress={close} style={[styles.button, { backgroundColor: palette.accent }]}>
              <Text style={[styles.buttonText, { color: palette.background }]}>Continuar jornada</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000b', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 460, maxHeight: '90%', borderRadius: 28, borderWidth: 2, overflow: 'hidden' },
  content: { padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  art: { width: '100%', height: 240 },
  name: { fontSize: 21, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { alignSelf: 'stretch', padding: 16, borderRadius: 16, marginTop: 8 },
  buttonText: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
});
