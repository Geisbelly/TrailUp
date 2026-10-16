import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useId, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import { FontFamily } from "@/styles/GlobalStyle";
import type { EstadoTopico, PainelTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { FONTE_TITULO_TRILHA } from "@/components/web/fonteCinzel";

const SUCESSO = "#62db9b";

type ItemLista = { id: string; titulo: string; estado: EstadoTopico; percentual: number; numero: number };
/** Tópico personalizado: a justificativa do plano e o nome do guia do perfil. */
type Personalizacao = { texto: string; guia: string };

/**
 * Painel de 300 px à direita da Trilha na web em tela larga (#346, protótipo
 * v4): o tópico selecionado, com progresso, o botão de entrar e a lista de
 * todos os módulos para trocar a seleção.
 */
export function PainelTopicoTrilha({
  painel,
  todos,
  palette,
  onSelecionar,
  numero,
  local,
  personalizacao,
  onConversar,
}: {
  painel: PainelTopico | null;
  todos: ItemLista[];
  palette: ProfileShellPalette;
  onSelecionar: (id: string) => void;
  /** Posição do tópico na trilha (o número do hexágono). */
  numero?: number;
  /** No mapa: "País · Capital: …". */
  local?: string | null;
  personalizacao?: Personalizacao | null;
  onConversar?: () => void;
}) {
  // Aberta por padrão, como no protótipo.
  const [listaAberta, setListaAberta] = useState(true);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const corEstado = (e: EstadoTopico) => (e === "done" ? SUCESSO : e === "locked" ? palette.textSubtle : palette.accent);

  return (
    <View
      accessibilityLabel="Tópico selecionado"
      style={[s.painel, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <ScrollView style={s.rolagem} contentContainerStyle={s.rolagemConteudo}>
        {painel ? (
          <>
            <View style={s.cabeca}>
              <HexagonoTopico estado={painel.estado} numero={numero ?? 0} tamanho={56} palette={palette} idBase={`painel-${uid}`} />
              <View style={s.cabecaTexto}>
                <Text style={[s.eyebrow, { color: corEstado(painel.estado) }]}>{painel.eyebrow.toUpperCase()}</Text>
                <Text style={[s.titulo, { color: palette.text }]}>{painel.titulo}</Text>
                {local ? <Text style={[s.local, { color: palette.textMuted }]}>{local}</Text> : null}
              </View>
            </View>

            {painel.estado === "locked" ? (
              <View style={[s.secao, s.bloqueado, { backgroundColor: palette.surfaceElevated }]}>
                <Text style={[s.bloqueadoTitulo, { color: palette.text }]}>{painel.titulo} está bloqueado</Text>
                <Text style={[s.texto, { color: palette.textMuted }]}>Conclua os módulos anteriores para liberar este conteúdo.</Text>
                {painel.prerequisitos.length ? (
                  <>
                    <Text style={[s.texto, { color: palette.textMuted }]}>
                      Pré-requisitos: {painel.prerequisitos.map((p) => p.titulo).join(" e ")}.
                    </Text>
                    <Pressable accessibilityRole="button" onPress={() => onSelecionar(painel.prerequisitos[0].id)}>
                      <Text style={[s.link, { color: palette.accent }]}>Ver {painel.prerequisitos[0].titulo} →</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : (
              <>
                <View style={s.secao}>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: painel.percentual }}
                    style={[s.trilho, { backgroundColor: palette.progressTrack }]}
                  >
                    <View style={[s.preenchido, { width: `${painel.percentual}%`, backgroundColor: palette.accent }]} />
                  </View>
                  <View style={s.rotuloBarra}>
                    <Text style={[s.pequeno, { color: palette.textMuted }]}>{painel.percentual}% do módulo</Text>
                    <Text style={[s.pequeno, { color: palette.textSubtle }]}>
                      {painel.estado === "open" ? "Ainda não iniciado" : painel.estado === "done" ? "Concluído" : ""}
                    </Text>
                  </View>
                </View>
                <View style={[s.secao, s.contagem]}>
                  <View style={[s.contador, { backgroundColor: palette.surfaceElevated }]}>
                    <Text style={[s.numero, { color: palette.text }]}>{painel.conteudos}</Text>
                    <Text style={[s.pequeno, { color: palette.textMuted }]}>conteúdos</Text>
                  </View>
                  <View style={[s.contador, { backgroundColor: palette.surfaceElevated }]}>
                    <Text style={[s.numero, { color: palette.text }]}>{painel.atividades}</Text>
                    <Text style={[s.pequeno, { color: palette.textMuted }]}>atividades</Text>
                  </View>
                </View>
                {personalizacao ? (
                  <View style={s.secao}>
                    <View style={[s.perso, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
                      <View style={[s.persoChip, { backgroundColor: palette.accentMuted, borderColor: palette.border }]}>
                        <MaterialCommunityIcons name="star-four-points" size={11} color={palette.accent} />
                        <Text style={[s.persoChipTexto, { color: palette.accent }]}>Módulo personalizado</Text>
                      </View>
                      <Text style={[s.texto, { color: palette.text }]}>{personalizacao.texto}</Text>
                      {onConversar ? (
                        <Pressable accessibilityRole="button" onPress={onConversar}>
                          <Text style={[s.link, { color: palette.accent }]}>Conversar com {personalizacao.guia} →</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : (
          <Text style={[s.texto, s.secao, { color: palette.textMuted }]}>Nenhum módulo nesta trilha ainda.</Text>
        )}

        {todos.length ? (
          <View style={[s.lista, { borderTopColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: listaAberta }}
              onPress={() => setListaAberta((v) => !v)}
              style={s.listaBotao}
            >
              <Text style={[s.listaTitulo, { color: palette.text }]}>Todos os módulos ({todos.length})</Text>
              <MaterialCommunityIcons name={listaAberta ? "chevron-up" : "chevron-down"} size={18} color={palette.textMuted} />
            </Pressable>
            {listaAberta
              ? todos.map((item) => {
                  const atual = item.id === painel?.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: atual }}
                      onPress={() => onSelecionar(item.id)}
                      style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                        s.item,
                        atual || hovered ? { backgroundColor: palette.surfaceElevated } : null,
                      ]}
                    >
                      <HexagonoTopico estado={item.estado} numero={item.numero} tamanho={24} palette={palette} idBase={`lista-${uid}-${item.id}`} />
                      <Text style={[s.itemNome, { color: atual ? palette.text : palette.textMuted }]} numberOfLines={1}>
                        {item.titulo}
                      </Text>
                      {item.estado !== "locked" ? (
                        <Text style={[s.pequeno, { color: palette.textSubtle }]}>{item.percentual}%</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              : null}
          </View>
        ) : null}
      </ScrollView>

      {painel?.acao ? (
        <View style={[s.pe, { borderTopColor: palette.border }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(tabs)/trilha/${encodeURIComponent(painel.id)}`)}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
              s.botao,
              painel.estado === "done"
                ? { borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: hovered ? palette.surfaceElevated : "transparent" }
                : { backgroundColor: palette.accent, opacity: hovered ? 0.9 : 1 },
            ]}
          >
            <Text style={[s.botaoTexto, { color: painel.estado === "done" ? palette.text : palette.background }]}>{painel.acao}</Text>
            {painel.estado !== "done" ? <MaterialCommunityIcons name="arrow-right" size={18} color={palette.background} /> : null}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  painel: { flex: 1, width: 300, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  rolagem: { flex: 1 },
  rolagemConteudo: { paddingBottom: 12 },
  cabeca: { flexDirection: "row", gap: 14, padding: 22, paddingBottom: 18, alignItems: "flex-start" },
  selo: { width: 56, height: 56, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  cabecaTexto: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  titulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 19, lineHeight: 24 },
  secao: { paddingHorizontal: 22, paddingBottom: 18 },
  bloqueado: { marginHorizontal: 22, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, borderRadius: 12, gap: 8 },
  bloqueadoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 4 },
  rotuloBarra: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  contagem: { flexDirection: "row", gap: 10 },
  contador: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  numero: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  lista: { borderTopWidth: 1, marginTop: 4, paddingHorizontal: 12, paddingTop: 8 },
  listaBotao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 10 },
  listaTitulo: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  itemNome: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 13 },
  pe: { padding: 18, paddingHorizontal: 22, borderTopWidth: 1 },
  botao: { borderRadius: 999, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  local: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  perso: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  persoChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  persoChipTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
