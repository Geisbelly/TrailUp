import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/database/supabase";
import { getProfileArtwork } from "@/constants/designAssets";
import type { Classe } from "@/models/Classe";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

type Props = {
  classes: Classe[];
  carregando: boolean;
  erro: Error | null;
  perfil: string;
  onSelect: (classeId: number) => void;
  onRetry: () => Promise<void>;
};

/** % de tópicos concluídos da turma. É só o que cabe aqui: o cálculo completo da Trilha usa o progresso personalizado, que esta tela não tem. */
function percentualDaTurma(classe: Classe): number {
  const topicos = classe.topicos ?? [];
  if (!topicos.length) return 0;
  const concluidos = topicos.filter((t) => String(t.status ?? "").toLowerCase().includes("concl") || Number(t.percentual_concluido ?? 0) >= 100).length;
  return Math.round((concluidos / topicos.length) * 100);
}

/**
 * Escolha de turma (mobile-v1, `03-trilha.html`, estado "Escolha de turma"): o cenário
 * do perfil ao fundo, o título à esquerda e, em cada turma, a matéria numa pílula, o
 * professor, o progresso e o botão "Entrar na turma".
 */
export default function SelecionarTurmaScreen({ classes, carregando, erro, perfil, onSelect, onRetry }: Props) {
  const palette = getProfileShellPalette(perfil);
  const [saindo, setSaindo] = useState(false);
  const [erroSaida, setErroSaida] = useState<string | null>(null);

  const sair = async () => {
    setSaindo(true);
    setErroSaida(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      // O guard de sessão envia para o login, como nos demais fluxos de auth.
    } catch {
      setErroSaida("Não foi possível sair. Tente novamente.");
    } finally {
      setSaindo(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <View accessible={false} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <Image source={getProfileArtwork(perfil, "trail")} resizeMode="cover" style={styles.cenario} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: 0.3 }]} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>Escolha sua turma</Text>
          <Text style={[styles.description, { color: palette.textMuted }]}>
            {classes.length > 0
              ? `Você está em ${classes.length} ${classes.length === 1 ? "turma" : "turmas"}. Escolha por onde continuar.`
              : "Em qual turma você quer estudar agora?"}
          </Text>
        </View>

        {carregando ? (
          <View style={styles.feedback} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={palette.accent} />
            <Text style={[styles.description, { color: palette.textMuted }]}>Buscando suas turmas…</Text>
          </View>
        ) : erro ? (
          <View style={[styles.feedback, styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text accessibilityRole="alert" style={[styles.cardTitle, { color: palette.text }]}>Não foi possível carregar suas turmas</Text>
            <Text style={[styles.description, { color: palette.textMuted }]}>Verifique sua conexão e tente novamente.</Text>
          </View>
        ) : classes.length === 0 ? (
          <View style={[styles.feedback, styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Você ainda não está em uma turma</Text>
            <Text style={[styles.description, { color: palette.textMuted }]}>
              Peça ao professor para adicionar você à turma. Depois, toque em atualizar.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {classes.map((classe) => {
              const materia = classe.resumo?.materia_nome || "Turma";
              const professor = classe.resumo?.professor_nome;
              const progresso = percentualDaTurma(classe);
              return (
                <Pressable
                  key={classe.classe_id}
                  accessibilityRole="button"
                  accessibilityLabel={`Entrar em ${materia}, turma ${classe.classe_id}${professor ? `, professor ${professor}` : ""}, ${progresso}% concluído`}
                  disabled={saindo}
                  onPress={() => onSelect(classe.classe_id)}
                  style={({ pressed }) => [styles.card, {
                    backgroundColor: pressed ? palette.surfaceElevated : palette.surface,
                    borderColor: pressed ? palette.accent : palette.border,
                    opacity: saindo ? 0.5 : 1,
                  }]}
                >
                  <View style={[styles.materia, { backgroundColor: palette.accentMuted, borderColor: palette.accentSoft }]}>
                    <Text style={[styles.materiaTexto, { color: palette.accent }]}>{materia.toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{materia}</Text>
                  <Text style={[styles.professor, { color: palette.textMuted }]}>
                    {professor ? `Prof. ${professor} · ` : ""}Turma {classe.classe_id}
                  </Text>
                  <View style={[styles.trilho, { backgroundColor: palette.background, borderColor: palette.border }]}>
                    <View style={[styles.preenchido, { width: `${progresso}%`, backgroundColor: palette.accent }]} />
                  </View>
                  <Text style={[styles.progresso, { color: palette.textMuted }]}>{progresso}% concluído</Text>
                  <View style={[styles.entrar, { borderColor: palette.accent }]}>
                    <Text style={[styles.entrarTexto, { color: palette.text }]}>Entrar na turma</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!carregando ? (
          <Pressable
            accessibilityRole="button"
            disabled={saindo}
            onPress={() => { void onRetry(); }}
            style={[styles.action, { borderColor: palette.borderStrong }]}
          >
            <Text style={[styles.actionText, { color: palette.accent }]}>{erro ? "Tentar novamente" : "Atualizar turmas"}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" disabled={saindo} onPress={() => { void sair(); }} style={styles.action}>
          <Text style={[styles.actionText, { color: palette.textMuted }]}>{saindo ? "Saindo…" : "Sair da conta"}</Text>
        </Pressable>
        {erroSaida ? <Text accessibilityRole="alert" style={[styles.description, { color: palette.text }]}>{erroSaida}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cenario: { width: "100%", height: "100%" },
  content: { flexGrow: 1, width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 32, paddingBottom: 32, gap: 14 },
  heading: { gap: 6, paddingBottom: 4 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 26 },
  description: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  feedback: { alignItems: "center", gap: 16, paddingVertical: 28 },
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  materia: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  materiaTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  cardTitle: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  professor: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  trilho: { height: 6, borderRadius: 999, borderWidth: 1, overflow: "hidden", marginTop: 4 },
  preenchido: { height: "100%" },
  progresso: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  entrar: { minHeight: 48, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 6 },
  entrarTexto: { fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700" },
  action: { minHeight: 48, borderWidth: 1, borderColor: "transparent", borderRadius: 12, padding: 12, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: FontFamily.interMedium, fontSize: 14 },
});
