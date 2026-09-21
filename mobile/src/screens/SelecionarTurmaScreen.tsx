import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/database/supabase";
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <MaterialCommunityIcons name="school-outline" size={44} color={palette.accent} accessible={false} />
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>Escolha sua turma</Text>
          <Text style={[styles.description, { color: palette.textMuted }]}>
            Em qual turma você quer estudar agora? Toque em uma turma para entrar na sua trilha.
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
              return (
                <Pressable
                  key={classe.classe_id}
                  accessibilityRole="button"
                  accessibilityLabel={`Entrar em ${materia}, turma ${classe.classe_id}${professor ? `, professor ${professor}` : ""}`}
                  disabled={saindo}
                  onPress={() => onSelect(classe.classe_id)}
                  style={({ pressed }) => [styles.card, styles.classCard, {
                    backgroundColor: pressed ? palette.surfaceElevated : palette.surface,
                    borderColor: pressed ? palette.accent : palette.border,
                    opacity: saindo ? 0.5 : 1,
                  }]}
                >
                  <View style={styles.classInfo}>
                    <Text style={[styles.caption, { color: palette.accent }]}>TURMA {classe.classe_id}</Text>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{materia}</Text>
                    {professor ? <Text style={[styles.professor, { color: palette.textMuted }]}>Professor(a): {professor}</Text> : null}
                    <Text style={[styles.enterLabel, { color: palette.accent }]}>Entrar na turma</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={28} color={palette.accent} accessible={false} />
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
  content: { flexGrow: 1, width: "100%", maxWidth: 600, alignSelf: "center", padding: 24, paddingBottom: 32, gap: 16 },
  heading: { alignItems: "center", gap: 12, paddingTop: 20, paddingBottom: 12 },
  title: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 26, textAlign: "center" },
  description: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 22, textAlign: "center" },
  feedback: { alignItems: "center", gap: 16, paddingVertical: 28 },
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20 },
  classCard: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 120 },
  classInfo: { flex: 1, gap: 6 },
  caption: { fontFamily: FontFamily.interMedium, fontSize: 11, letterSpacing: 1.2 },
  cardTitle: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 18 },
  professor: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 20 },
  enterLabel: { fontFamily: FontFamily.interMedium, fontSize: 14, marginTop: 8 },
  action: { minHeight: 48, borderWidth: 1, borderColor: "transparent", borderRadius: 12, padding: 12, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: FontFamily.interMedium, fontSize: 14 },
});
