import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useId, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import { FontFamily } from "@/styles/GlobalStyle";
import { rotaDoTopico, type EstadoTopico, type PainelTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const SUCESSO = "#62db9b";

/** Altura da folha recolhida (alça + linha do tópico), usada para reservar espaço no tabuleiro. */
export const ALTURA_FOLHA_RECOLHIDA = 96;

type ItemLista = { id: string; titulo: string; estado: EstadoTopico; percentual: number; numero: number };

/**
 * Folha de baixo da Trilha no celular (mobile-v1, 03-trilha.html). Recolhida fica sempre
 * visível acima da barra de abas: hexágono, eyebrow, nome e o botão principal. Expandida
 * (até 70% da altura) traz o resto do painel do v4: progresso, contagens, personalização e
 * a lista de módulos. Reaproveita as regras de `painelTopicoTrilha`.
 */
export function FolhaTopicoTrilha({
  painel,
  todos,
  palette,
  numero,
  local,
  personalizacao,
  onConversar,
  onSelecionar,
  expandida,
  onExpandir,
}: {
  painel: PainelTopico | null;
  todos: ItemLista[];
  palette: ProfileShellPalette;
  numero?: number;
  local?: string | null;
  personalizacao?: { texto: string; guia: string } | null;
  onConversar?: () => void;
  onSelecionar: (id: string) => void;
  expandida: boolean;
  onExpandir: (aberta: boolean) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { height } = useWindowDimensions();
  const [listaAberta, setListaAberta] = useState(false);
  useEffect(() => {
    if (!expandida) setListaAberta(false);
  }, [expandida]);
  if (!painel) return null;

  const corEstado = painel.estado === "done" ? SUCESSO : painel.estado === "locked" ? palette.textSubtle : palette.accent;
  const abrir = () => router.push(rotaDoTopico(painel.id));

  return (
    <View
      accessibilityLabel="Tópico selecionado"
      style={[s.folha, { backgroundColor: palette.surface, borderColor: palette.borderStrong, maxHeight: Math.round(height * 0.7) }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expandida ? "Recolher detalhes do tópico" : "Expandir detalhes do tópico"}
        accessibilityState={{ expanded: expandida }}
        onPress={() => onExpandir(!expandida)}
        style={s.alcaToque}
      >
        <View style={[s.alca, { backgroundColor: palette.borderStrong }]} />
      </Pressable>

      <View style={s.linha}>
        <Pressable accessibilityRole="button" onPress={() => onExpandir(!expandida)} style={s.linhaTopico}>
          <HexagonoTopico estado={painel.estado} numero={numero ?? 0} tamanho={40} palette={palette} idBase={`folha-${uid}`} />
          <View style={s.textos}>
            <Text style={[s.eyebrow, { color: corEstado }]}>{painel.eyebrow.toUpperCase()}</Text>
            <Text numberOfLines={1} style={[s.titulo, { color: palette.text }]}>{painel.titulo}</Text>
          </View>
        </Pressable>
        {painel.acao ? (
          <Pressable
            accessibilityRole="button"
            onPress={abrir}
            style={[
              s.botao,
              painel.estado === "done"
                ? { borderWidth: 1, borderColor: palette.borderStrong }
                : { backgroundColor: palette.accent },
            ]}
          >
            <Text style={[s.botaoTexto, { color: painel.estado === "done" ? palette.text : palette.background }]}>{painel.acao}</Text>
          </Pressable>
        ) : null}
      </View>

      {expandida ? (
        <ScrollView style={s.rolagem} contentContainerStyle={s.rolagemConteudo}>
          {local ? <Text style={[s.texto, { color: palette.textMuted }]}>{local}</Text> : null}

          {painel.estado === "locked" ? (
            <View style={[s.bloco, { backgroundColor: palette.surfaceElevated }]}>
              <Text style={[s.blocoTitulo, { color: palette.text }]}>{painel.titulo} está bloqueado</Text>
              <Text style={[s.texto, { color: palette.textMuted }]}>Conclua os módulos anteriores para liberar este conteúdo.</Text>
              {painel.prerequisitos.length ? (
                <>
                  <Text style={[s.texto, { color: palette.textMuted }]}>
                    Pré-requisitos: {painel.prerequisitos.map((p) => p.titulo).join(" e ")}.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => onSelecionar(painel.prerequisitos[0].id)} style={s.linkToque}>
                    <Text style={[s.link, { color: palette.accent }]}>Ver {painel.prerequisitos[0].titulo} →</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : (
            <>
              <View>
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: painel.percentual }}
                  style={[s.trilho, { backgroundColor: palette.progressTrack }]}
                >
                  <View style={[s.preenchido, { width: `${painel.percentual}%`, backgroundColor: palette.accent }]} />
                </View>
                <Text style={[s.pequeno, { color: palette.textMuted }]}>{painel.percentual}% do módulo</Text>
              </View>
              <View style={s.contagem}>
                <View style={[s.contador, { backgroundColor: palette.surfaceElevated }]}>
                  <Text style={[s.numero, { color: palette.text }]}>{painel.conteudos}</Text>
                  <Text style={[s.pequeno, { color: palette.textMuted }]}>{painel.conteudos === 1 ? "conteúdo" : "conteúdos"}</Text>
                </View>
                <View style={[s.contador, { backgroundColor: palette.surfaceElevated }]}>
                  <Text style={[s.numero, { color: palette.text }]}>{painel.atividades}</Text>
                  <Text style={[s.pequeno, { color: palette.textMuted }]}>{painel.atividades === 1 ? "atividade" : "atividades"}</Text>
                </View>
              </View>
              {personalizacao ? (
                <View style={[s.bloco, { backgroundColor: palette.surfaceElevated, borderColor: palette.border, borderWidth: 1 }]}>
                  <View style={[s.chip, { backgroundColor: palette.accentMuted, borderColor: palette.border }]}>
                    <MaterialCommunityIcons name="star-four-points" size={11} color={palette.accent} />
                    <Text style={[s.chipTexto, { color: palette.accent }]}>Módulo personalizado</Text>
                  </View>
                  <Text style={[s.texto, { color: palette.text }]}>{personalizacao.texto}</Text>
                  {onConversar ? (
                    <Pressable accessibilityRole="button" onPress={onConversar} style={s.linkToque}>
                      <Text style={[s.link, { color: palette.accent }]}>Conversar com {personalizacao.guia} →</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          {todos.length ? (
            <View style={[s.lista, { borderTopColor: palette.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: listaAberta }}
                onPress={() => setListaAberta((v) => !v)}
                style={s.listaBotao}
              >
                <Text style={[s.blocoTitulo, { color: palette.text }]}>Todos os módulos ({todos.length})</Text>
                <MaterialCommunityIcons name={listaAberta ? "chevron-up" : "chevron-down"} size={20} color={palette.textMuted} />
              </Pressable>
              {listaAberta
                ? todos.map((item) => {
                    const atual = item.id === painel.id;
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: atual }}
                        onPress={() => onSelecionar(item.id)}
                        style={[s.item, atual ? { backgroundColor: palette.surfaceElevated } : null]}
                      >
                        <HexagonoTopico estado={item.estado} numero={item.numero} tamanho={28} palette={palette} idBase={`lista-${uid}-${item.id}`} />
                        <Text numberOfLines={1} style={[s.itemNome, { color: atual ? palette.text : palette.textMuted }]}>{item.titulo}</Text>
                        {item.estado !== "locked" ? <Text style={[s.pequeno, { color: palette.textSubtle }]}>{item.percentual}%</Text> : null}
                      </Pressable>
                    );
                  })
                : null}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  folha: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, overflow: "hidden" },
  alcaToque: { height: 24, alignItems: "center", justifyContent: "center" },
  alca: { width: 36, height: 4, borderRadius: 2 },
  linha: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 14, minHeight: 72 },
  linhaTopico: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  titulo: { fontFamily: "Georgia, serif", fontSize: 17 },
  botao: { minHeight: 48, borderRadius: 999, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  rolagem: { flexShrink: 1 },
  rolagemConteudo: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  bloco: { borderRadius: 12, padding: 14, gap: 8 },
  blocoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 20 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  linkToque: { minHeight: 48, justifyContent: "center" },
  trilho: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  preenchido: { height: "100%", borderRadius: 3 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  contagem: { flexDirection: "row", gap: 10 },
  contador: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  numero: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700" },
  lista: { borderTopWidth: 1, paddingTop: 4 },
  listaBotao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 8, borderRadius: 8 },
  itemNome: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 14 },
});
