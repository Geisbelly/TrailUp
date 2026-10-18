import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getAchievementArtwork } from "@/constants/achievementImages";
import type { Conquista, ConquistaBibliotecaItem, ConquistaBibliotecaStatus } from "@/models/Conquista";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Filtro = "todas" | ConquistaBibliotecaStatus;
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "concluida", rotulo: "Concluídas" },
  { id: "em_progresso", rotulo: "Em progresso" },
  { id: "bloqueada", rotulo: "Bloqueadas" },
];

// Como o `auto-fit, minmax(120px, 1fr)` do protótipo: quantas colunas de 120 px cabem, e todas da mesma largura.
const MINIMO = 120;
const ESPACO = 14;

/**
 * Biblioteca de conquistas na web em tela larga (#346, protótipo v4,
 * 09-biblioteca-conquistas.html): números no topo, filtros e a grade de
 * conquistas. Concluída com a borda na cor do perfil, em progresso com a
 * barra, bloqueada apagada e com cadeado. Tocar abre o mesmo detalhe do app.
 */
export function BibliotecaDesktop({
  itens,
  carregando,
  palette,
  resumoRef,
  onAbrir,
}: {
  itens: ConquistaBibliotecaItem[];
  carregando: boolean;
  palette: ProfileShellPalette;
  resumoRef?: React.RefObject<View | null>;
  onAbrir: (conquista: Conquista) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [largura, setLargura] = useState(0);

  const concluidas = itens.filter((i) => i.status === "concluida").length;
  const emProgresso = itens.filter((i) => i.status === "em_progresso").length;
  const completo = itens.length ? Math.round((concluidas / itens.length) * 100) : 0;
  const visiveis = filtro === "todas" ? itens : itens.filter((i) => i.status === filtro);

  const colunas = Math.max(1, Math.floor((largura + ESPACO) / (MINIMO + ESPACO)));
  const larguraCartao = largura ? (largura - ESPACO * (colunas - 1)) / colunas : MINIMO;

  const numeros: [number | string, string][] = [
    [concluidas, concluidas === 1 ? "Conquistada" : "Conquistadas"],
    [emProgresso, "Em progresso"],
    [`${completo}%`, "Completo"],
  ];

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={s.fora}>
      <View style={s.pagina}>
        <Text style={[s.eyebrow, { color: palette.accent }]}>PERFIL</Text>
        <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>Biblioteca de Conquistas</Text>

        <View ref={resumoRef} collapsable={false} style={s.resumo}>
          {numeros.map(([valor, rotulo]) => (
            <View key={rotulo} style={[s.numeroCartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[s.numero, { color: palette.accent }]}>{valor}</Text>
              <Text style={[s.numeroRotulo, { color: palette.textSubtle }]}>{rotulo}</Text>
            </View>
          ))}
        </View>

        <View style={s.filtros}>
          {FILTROS.map(({ id, rotulo }) => {
            const ativo = filtro === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: ativo }}
                onPress={() => setFiltro(id)}
                style={[s.filtro, { borderColor: ativo ? palette.accent : palette.borderStrong, backgroundColor: ativo ? palette.accent : "transparent" }]}
              >
                <Text style={[s.filtroTexto, { color: ativo ? palette.background : palette.textMuted, fontWeight: ativo ? "700" : "500" }]}>{rotulo}</Text>
              </Pressable>
            );
          })}
        </View>

        {carregando && !itens.length ? <ActivityIndicator color={palette.accent} style={s.vazio} /> : null}
        {!carregando && !visiveis.length ? (
          <Text style={[s.vazio, { color: palette.textMuted }]}>
            {itens.length ? "Nenhuma conquista neste filtro." : "Nenhuma conquista disponível ainda."}
          </Text>
        ) : null}

        <View style={s.grade} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
          {visiveis.map(({ conquista, status, progressoPercentual }) => {
            const feita = status === "concluida";
            const bloqueada = status === "bloqueada";
            const pct = Math.round(progressoPercentual);
            return (
              <Pressable
                key={conquista.conquista_id}
                accessibilityRole="button"
                accessibilityLabel={`${conquista.nome}: ${feita ? "concluída" : bloqueada ? "bloqueada" : `${pct}% feito`}`}
                onPress={() => onAbrir(conquista)}
                style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                  s.cartao,
                  {
                    width: larguraCartao,
                    borderColor: feita ? palette.accent : palette.border,
                    backgroundColor: feita || hovered ? palette.surfaceElevated : palette.surface,
                  },
                ]}
              >
                {bloqueada ? (
                  <MaterialCommunityIcons name="lock-outline" size={14} color={palette.textSubtle} style={s.cadeado} />
                ) : null}
                <Image source={getAchievementArtwork(conquista)} resizeMode="contain" style={[s.arte, bloqueada && s.arteApagada]} />
                <Text style={[s.nome, { color: bloqueada ? palette.textSubtle : palette.text }]} numberOfLines={2}>
                  {conquista.nome}
                </Text>
                {status === "em_progresso" ? (
                  <>
                    <View style={[s.trilho, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                      <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: palette.accent }]} />
                    </View>
                    <Text style={[s.pct, { color: palette.textSubtle }]}>{pct}%</Text>
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fora: { alignItems: "center" },
  pagina: { width: "100%", maxWidth: 1080, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 60 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 28, marginBottom: 18 },
  resumo: { flexDirection: "row", gap: 14, marginBottom: 24 },
  numeroCartao: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 18 },
  numero: { fontFamily: FontFamily.inikaBold, fontSize: 28 },
  numeroRotulo: { fontFamily: FontFamily.interMedium, fontSize: 12, marginTop: 2 },
  filtros: { flexDirection: "row", gap: 8, marginBottom: 20 },
  filtro: { borderRadius: 100, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 16 },
  filtroTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  vazio: { marginVertical: 24 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: ESPACO },
  cartao: { borderRadius: 14, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 10, alignItems: "center", gap: 8 },
  cadeado: { position: "absolute", top: 10, right: 10 },
  arte: { width: 40, height: 40 },
  arteApagada: { opacity: 0.3 },
  nome: { fontFamily: FontFamily.interMedium, fontSize: 11.5, fontWeight: "700", lineHeight: 15, textAlign: "center" },
  trilho: { width: "100%", height: 5, borderRadius: 100, overflow: "hidden" },
  preenchido: { height: "100%" },
  pct: { fontFamily: FontFamily.interMedium, fontSize: 10 },
});
