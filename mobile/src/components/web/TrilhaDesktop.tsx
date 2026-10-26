import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ProfileEmblem } from "@/components/ProfileEmblem";
import { TrilhaArvoreSimple } from "@/components/trilhas/ArvoreView";
import { TrilhaLinearList } from "@/components/trilhas/ListaSimplesView";
import { type GuideTargetRefs, ModuleHeaderGuideButton } from "@/components/trilhas/ModuleHeaderTitle";
import { MapaPaisesDesktop } from "@/components/web/MapaPaisesDesktop";
import { PainelTopicoTrilha } from "@/components/web/PainelTopicoTrilha";
import { getProfileArtwork } from "@/constants/designAssets";
import { getBrainHexGuideName } from "@/constants/profileImages";
import { useIA } from "@/context/IAContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { useTrailResumeTopic } from "@/hooks/useTrailResume";
import { FontFamily } from "@/styles/GlobalStyle";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import { aoClicarNo, estadoDoTopico, montarPainelTopico, rotaDoTopico, topicoInicial } from "@/utils/painelTopicoTrilha";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { calcularProgressoTrilha } from "@/utils/progressoTrilha";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { FONTE_TITULO_TRILHA, useFonteCinzel } from "@/components/web/fonteCinzel";

/**
 * Trilha na web em tela larga (#346, protótipo v4, `03-trilha.html`): o cartão
 * de progresso em cima, o tabuleiro (mapa, árvore ou lista, conforme o perfil)
 * embaixo, e o painel do tópico selecionado numa coluna de 300 px à direita.
 * A Bag fica na barra superior da moldura, não aqui.
 */
export function TrilhaDesktop({ chatGuideTargetRef }: { chatGuideTargetRef?: React.RefObject<View | null> }) {
  const { classeAtual, carregando, erro, visual, mapTheme, personalizedTopics, progressoPersonalizado, perfil, grafo } =
    useTrilha();
  const { usuario } = useUsuario();
  useFonteCinzel();
  const atualId = useTrailResumeTopic();
  const isFocused = useIsFocused();
  const palette = getProfileShellPalette(perfil);
  const capabilities = getBrainHexProfileCapabilities(perfil);
  const progressoRef = useRef<View | null>(null);
  const jornadaRef = useRef<View | null>(null);
  const guideTargetRefs = useMemo<GuideTargetRefs>(
    () => ({ progress: progressoRef, journey: jornadaRef, map: jornadaRef, tree: jornadaRef, list: jornadaRef, chat: chatGuideTargetRef }),
    [chatGuideTargetRef],
  );
  useEffect(() => (isFocused ? registrarAlvoTour("trilha_resumo", progressoRef) : undefined), [isFocused]);
  useEffect(() => (isFocused ? registrarAlvoTour("trilha_mapa", jornadaRef) : undefined), [isFocused]);

  const [selecionado, setSelecionado] = useState<string | null>(null);
  // As vistas medem pelo tabuleiro, não pela janela. Até a primeira medida vale uma
  // estimativa pela janela (moldura, cartão de progresso e painel descontados).
  const janela = useWindowDimensions();
  const [medido, setMedido] = useState<{ largura: number; altura: number } | null>(null);
  const quadro = medido ?? {
    largura: Math.max(320, janela.width - 212 - 32 - 300 - 64),
    altura: Math.max(240, janela.height - 68 - 28 - 88 - 20 - 28),
  };
  const nos = grafo.nodes;
  const idPainel =
    selecionado !== null && nos.some((n) => String(n.id) === selecionado) ? selecionado : topicoInicial(nos, atualId);
  const noPainel = nos.find((n) => String(n.id) === idPainel);
  // Clique num nó do mapa, da árvore ou da lista: seleciona no painel e, se o
  // tópico estiver liberado, já abre. A lista do painel continua só selecionando.
  const clicarNo = (id: string) => {
    setSelecionado(id);
    if (aoClicarNo(nos.find((n) => String(n.id) === String(id))) === "abrir") router.push(rotaDoTopico(String(id)));
  };
  const topicoDe = (id: string) => classeAtual?.topicos.find((t) => String(t.id) === String(id));
  const painel = noPainel ? montarPainelTopico(noPainel, topicoDe(noPainel.id), atualId, nos, grafo.edges) : null;
  const todos = [...nos]
    .sort((a, b) => a.sequence - b.sequence)
    .map((n, i) => {
      const estado = estadoDoTopico(n, atualId);
      const pct = Number(topicoDe(n.id)?.percentual_concluido ?? 0);
      return { id: String(n.id), titulo: n.titulo, estado, percentual: estado === "done" ? 100 : Math.round(pct) || 0, numero: i + 1 };
    });
  // Detalhes do painel como no protótipo: o número, "País · Capital" no mapa e o
  // bloco do módulo personalizado, que abre a conversa com o guia.
  const { pushMentorCue, resolveFeature } = useIA();
  // Nem todo perfil tem o guia (mentor_character); sem ele, o link não aparece.
  const guiaDisponivel = resolveFeature({ scope: "session" }, "mentor_character").enabled;
  const itemPainel = todos.find((t) => t.id === idPainel);
  const paisPainel = idPainel ? mapTheme?.countries?.[idPainel] : undefined;
  const localPainel =
    visual === "mapa" && paisPainel ? `${paisPainel.countryName} · Capital: ${paisPainel.capitalName}` : null;
  const justificativa = idPainel
    ? String(personalizedTopics?.[Number(idPainel)]?.planMeta?.justification ?? "").trim()
    : "";
  const personalizacao = justificativa ? { texto: justificativa, guia: getBrainHexGuideName(perfil) } : null;
  const conversar = () =>
    idPainel &&
    pushMentorCue({
      message: justificativa,
      title: itemPainel?.titulo ?? null,
      topicoId: Number(idPainel),
      actionLabel: "Conversar",
      abrir: true,
    });
  // No mapa, cada tópico é um país do tema da turma (sem tema, o próprio título).
  const paises = todos.map((t) => ({
    id: t.id,
    nome: mapTheme?.countries?.[t.id]?.countryName ?? t.titulo,
    estado: t.estado,
    percentual: t.percentual,
    personalizado: Boolean(personalizedTopics?.[Number(t.id)]),
  }));

  if (carregando || erro || !classeAtual) return <View style={[s.tela, { backgroundColor: palette.background }]} />;

  const ehMapa = visual === "mapa";
  const cenario = (
    <View accessible={false} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Image key={perfil} source={getProfileArtwork(perfil, ehMapa ? "map" : "trail")} resizeMode="cover" style={s.cenario} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: 0.35 }]} />
    </View>
  );

  // Turma sem tópicos publicados: o protótipo troca cartão, tabuleiro e painel por um aviso no centro.
  if (nos.length === 0) {
    return (
      <View style={[s.tela, s.centro, { backgroundColor: palette.background }]}>
        {cenario}
        <View style={[s.vazio, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <MaterialCommunityIcons name="map-outline" size={46} color={palette.textSubtle} />
          <Text accessibilityRole="header" style={[s.vazioTitulo, { color: palette.text }]}>Sem trilhas</Text>
          <Text style={[s.vazioTexto, { color: palette.textSubtle }]}>Nenhuma trilha disponível no momento.</Text>
          <Text style={[s.vazioTexto, s.vazioNota, { color: palette.textSubtle }]}>
            Quando a trilha da turma for publicada, ela aparece aqui.
          </Text>
        </View>
      </View>
    );
  }

  const nome = ehMapa ? (mapTheme?.worldName ?? classeAtual.resumo?.materia_nome ?? "Classe") : (classeAtual.resumo?.materia_nome ?? "Classe");
  const { progresso, totalTopicos, concluidos } = calcularProgressoTrilha(classeAtual, progressoPersonalizado);
  const pct = Math.round(progresso);

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      {cenario}

      <View style={s.esquerda}>
        <View
          ref={progressoRef}
          collapsable={false}
          accessibilityLabel="Progresso da trilha"
          style={[s.hud, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <ProfileEmblem profile={perfil} size={48} />
          <View style={s.hudTitulo}>
            <Text style={[s.eyebrow, { color: palette.accent }]}>{ehMapa ? "MAPA DA JORNADA" : "SUA TRILHA"}</Text>
            <Text style={[s.titulo, { color: palette.text }]} numberOfLines={1}>{nome}</Text>
          </View>
          <View style={s.hudProgresso}>
            <View style={s.hudLinha}>
              <Text style={[s.pequeno, { color: palette.textSubtle }]}>
                <Text style={[s.pct, { color: palette.text }]}>{pct}%</Text> concluído
              </Text>
              <Text style={[s.pequeno, { color: palette.textSubtle }]}>
                {concluidos} de {totalTopicos} módulos
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: pct }}
              style={[s.trilho, { backgroundColor: palette.progressTrack }]}
            >
              <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: palette.accent }]} />
            </View>
          </View>
          <View style={[s.separador, { backgroundColor: palette.border }]} />
          <ModuleHeaderGuideButton
            profile={perfil}
            title={nome}
            totalBlocks={totalTopicos}
            completedBlocks={concluidos}
            scope="trilha"
            variant="icon"
            guideVariant={Object.keys(personalizedTopics ?? {}).length > 0 ? "personalizado" : "padrao_trilha"}
            visibleElements={{ visualMode: visual, hasChat: capabilities.hasChat, hasProgress: true }}
            perfis={usuario?.perfis ?? null}
            targetRefs={guideTargetRefs}
          />
        </View>

        <View
          ref={visual === "arvore" ? jornadaRef : undefined}
          collapsable={false}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== medido?.largura || height !== medido?.altura) setMedido({ largura: width, altura: height });
          }}
          // O mapa fica direto sobre o cenário, como no protótipo; árvore e lista ficam na caixa.
          style={[s.tabuleiro, visual === "mapa" ? s.tabuleiroMapa : { borderColor: palette.border }]}
        >
          {quadro && visual === "mapa" && (
            <View ref={jornadaRef} collapsable={false} style={s.preenche}>
              <MapaPaisesDesktop
                topicos={paises}
                quadro={quadro}
                selecionado={idPainel}
                perfil={perfil}
                palette={palette}
                onSelecionar={clicarNo}
              />
            </View>
          )}
          {quadro && visual === "arvore" && <TrilhaArvoreSimple currentTopicId={atualId} onSelecionarTopico={clicarNo} quadro={quadro} />}
          {quadro && visual === "lista" && (
            <TrilhaLinearList currentTopicId={atualId} tourTargetRef={jornadaRef} onSelecionarTopico={clicarNo} quadro={quadro} />
          )}
        </View>
      </View>

      <View style={s.direita}>
        <PainelTopicoTrilha
          painel={painel}
          todos={todos}
          palette={palette}
          onSelecionar={setSelecionado}
          numero={itemPainel?.numero}
          local={localPainel}
          personalizacao={personalizacao}
          onConversar={guiaDisponivel ? conversar : undefined}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, flexDirection: "row" },
  cenario: { width: "100%", height: "100%" },
  esquerda: { flex: 1, minWidth: 0, paddingLeft: 32, paddingTop: 28, paddingBottom: 28, gap: 20 },
  hud: { height: 88, borderRadius: 20, borderWidth: 1, paddingLeft: 18, paddingRight: 20, flexDirection: "row", alignItems: "center", gap: 18 },
  hudTitulo: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.1 },
  titulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 22 },
  hudProgresso: { width: 260 },
  hudLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  pequeno: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  pct: { fontFamily: FontFamily.inikaBold, fontSize: 16 },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 4 },
  separador: { width: 1, height: 40 },
  tabuleiroMapa: { borderWidth: 0, borderRadius: 0, overflow: "visible" },
  preenche: { flex: 1 },
  tabuleiro: { flex: 1, minHeight: 0, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  direita: { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 28 },
  centro: { alignItems: "center", justifyContent: "center", padding: 40 },
  vazio: { width: 520, maxWidth: "100%", alignItems: "center", gap: 16, paddingVertical: 64, paddingHorizontal: 40, borderRadius: 20, borderWidth: 1 },
  vazioTitulo: { fontFamily: FONTE_TITULO_TRILHA, fontSize: 24, textAlign: "center" },
  vazioTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 24, textAlign: "center", maxWidth: 480 },
  vazioNota: { fontSize: 13, lineHeight: 20 },
});
