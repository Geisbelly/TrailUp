import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DesktopSidebar } from "@/components/web/DesktopSidebar";
import { DesktopTopBar } from "@/components/web/DesktopTopBar";
import { FONTE_TITULO_TRILHA, useFonteCinzel } from "@/components/web/fonteCinzel";
import { getProfileArtwork } from "@/constants/designAssets";
import { getGuardianFaceImage } from "@/constants/profileImages";
import { usePortoes } from "@/context/PortoesContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import type { Classe } from "@/models/Classe";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useUrlDeImagem } from "@/hooks/useFonteDeImagem";

type Props = {
  classes: Classe[];
  carregando: boolean;
  erro: Error | null;
  perfil: string;
  onSelect: (classeId: number) => void;
  onRetry: () => Promise<void>;
};

// A barra lateral é a da barra de abas; antes da escolha não há abas montadas, então
// ela recebe uma navegação vazia: a Trilha aparece marcada e os itens não abrem nada
// (o portão continua mostrando esta tela). Configurações e Sair seguem funcionando.
const SEM_ABAS = {
  state: { index: 0, routes: [{ key: "index", name: "index" }] },
  navigation: { emit: () => ({ defaultPrevented: true }), navigate: () => undefined },
  descriptors: {},
} as unknown as BottomTabBarProps;

const porcentagem = (classe: Classe) => {
  const p = Math.round(Number(classe.getProgressoGeral?.() ?? 0));
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
};

/**
 * Escolha de turma na web em tela larga (#346, protótipo v4, estado "Escolha de
 * turma" de 03-trilha.html): dentro da moldura (barra superior e lateral), sobre
 * o cenário do perfil, com as turmas em cartões lado a lado.
 */
export function EscolhaTurmaDesktop({ classes, carregando, erro, perfil, onSelect, onRetry }: Props) {
  useFonteCinzel();
  const insets = useSafeAreaInsets();
  const { usuario } = useUsuario();
  const { aberturas } = usePortoes();
  const palette = getProfileShellPalette(perfil);
  const [saindo, setSaindo] = useState(false);
  const fotoAssinada = useUrlDeImagem(usuario?.foto_url);
  const foto = fotoAssinada ? { uri: fotoAssinada } : getGuardianFaceImage(perfil);

  const sair = async () => {
    setSaindo(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      setSaindo(false);
    }
  };

  const centro = (conteudo: React.ReactNode) => (
    <View style={[s.aviso, { backgroundColor: palette.surface, borderColor: palette.border }]}>{conteudo}</View>
  );

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      <DesktopTopBar palette={palette} nome={usuario?.nome ?? "Aluno"} perfilAtivo={perfil} foto={foto} />
      <View style={s.corpo}>
        <DesktopSidebar {...SEM_ABAS} insets={insets} palette={palette} aberturas={aberturas} onBloqueado={() => undefined} />
        <View style={s.area}>
          <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
            <Image source={getProfileArtwork(perfil, "trail")} resizeMode="cover" style={s.cenario} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: 0.55 }]} />
          </View>
          <ScrollView contentContainerStyle={s.conteudo}>
            {carregando ? (
              <View style={s.carregando} accessibilityLiveRegion="polite">
                <ActivityIndicator size="large" color={palette.accent} />
                <Text style={[s.subtitulo, { color: palette.textMuted }]}>Buscando suas turmas…</Text>
              </View>
            ) : erro ? (
              centro(
                <>
                  <MaterialCommunityIcons name="alert-circle-outline" size={36} color={palette.textSubtle} />
                  <Text accessibilityRole="alert" style={[s.avisoTitulo, { color: palette.text }]}>Não foi possível carregar suas turmas</Text>
                  <Text style={[s.subtitulo, { color: palette.textMuted }]}>Verifique sua conexão e tente novamente.</Text>
                  <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={[s.botao, { borderColor: palette.borderStrong }]}>
                    <Text style={[s.botaoTexto, { color: palette.text }]}>Tentar novamente</Text>
                  </Pressable>
                </>,
              )
            ) : classes.length === 0 ? (
              centro(
                <>
                  <MaterialCommunityIcons name="school-outline" size={40} color={palette.textSubtle} />
                  <Text style={[s.avisoTitulo, { color: palette.text }]}>Você ainda não está em uma turma</Text>
                  <Text style={[s.subtitulo, { color: palette.textMuted }]}>
                    Peça ao professor para adicionar você à turma. Depois, toque em atualizar.
                  </Text>
                  <View style={s.linhaBotoes}>
                    <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={[s.botao, { borderColor: palette.borderStrong }]}>
                      <Text style={[s.botaoTexto, { color: palette.text }]}>Atualizar turmas</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={saindo} onPress={() => void sair()} style={[s.botao, { borderColor: palette.borderStrong }]}>
                      <Text style={[s.botaoTexto, { color: palette.textMuted }]}>{saindo ? "Saindo…" : "Sair da conta"}</Text>
                    </Pressable>
                  </View>
                </>,
              )
            ) : (
              <View style={s.escolha}>
                <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>Escolha sua turma</Text>
                <Text style={[s.subtitulo, { color: palette.textMuted }]}>
                  {classes.length === 1 ? "Você está em 1 turma." : `Você está em ${classes.length} turmas.`} Escolha por onde continuar.
                </Text>
                <View style={s.grade}>
                  {classes.map((classe) => {
                    const materia = classe.resumo?.materia_nome || "Turma";
                    const professor = classe.resumo?.professor_nome;
                    const pct = porcentagem(classe);
                    return (
                      <View key={classe.classe_id} style={[s.cartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={[s.chip, { backgroundColor: pct > 0 ? palette.accentMuted : palette.surfaceElevated }]}>
                          <Text style={[s.chipTexto, { color: pct > 0 ? palette.accent : palette.textMuted }]}>{materia.toUpperCase()}</Text>
                        </View>
                        <Text style={[s.cartaoTitulo, { color: palette.text }]} numberOfLines={2}>{materia}</Text>
                        <Text style={[s.meta, { color: palette.textMuted }]}>
                          Turma {classe.classe_id}
                          {professor ? ` · Prof. ${professor}` : ""}
                        </Text>
                        <View style={[s.trilho, { backgroundColor: palette.progressTrack }]}>
                          <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: palette.accent }]} />
                        </View>
                        <Text style={[s.meta, { color: palette.textSubtle }]}>{pct > 0 ? `${pct}% concluído` : "Não iniciada"}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Entrar em ${materia}, turma ${classe.classe_id}${professor ? `, professor ${professor}` : ""}`}
                          onPress={() => onSelect(classe.classe_id)}
                          style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                            s.botao,
                            s.botaoCartao,
                            { borderColor: palette.borderStrong, backgroundColor: hovered ? palette.surfaceElevated : "transparent" },
                          ]}
                        >
                          <Text style={[s.botaoTexto, { color: palette.text }]}>Entrar na turma</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
                <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={s.atualizar}>
                  <MaterialCommunityIcons name="refresh" size={15} color={palette.accent} />
                  <Text style={[s.atualizarTexto, { color: palette.accent }]}>Atualizar turmas</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1 },
  corpo: { flex: 1, flexDirection: "row" },
  area: { flex: 1, minWidth: 0 },
  cenario: { width: "100%", height: "100%" },
  conteudo: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  carregando: { alignItems: "center", gap: 16 },
  escolha: { alignItems: "center", gap: 6, width: "100%", maxWidth: 1000 },
  titulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 32, textAlign: "center" },
  subtitulo: { fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 22, textAlign: "center" },
  grade: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 18, width: "100%" },
  cartao: { width: 300, borderRadius: 16, borderWidth: 1, padding: 18, gap: 8 },
  chip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8 },
  cartaoTitulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 20 },
  meta: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  trilho: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  preenchido: { height: "100%", borderRadius: 3 },
  botao: { alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 18 },
  botaoCartao: { marginTop: 6 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  atualizar: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, padding: 6 },
  atualizarTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  aviso: { width: 520, maxWidth: "100%", alignItems: "center", gap: 14, borderRadius: 20, borderWidth: 1, paddingVertical: 48, paddingHorizontal: 40 },
  avisoTitulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 22, textAlign: "center" },
  linhaBotoes: { flexDirection: "row", gap: 10 },
});
