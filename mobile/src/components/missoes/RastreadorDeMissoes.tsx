import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBrainHexGuideName } from "@/constants/profileImages";
import { rotuloDoEscopo } from "@/services/missoes/missaoModel";
import {
  carregarMissoesDoRastreador,
  comDestino,
  montarRastreador,
  percentualDaMissao,
  prazoDaMissao,
  rotaDoDestino,
  rotuloDaRecompensa,
  type MissaoComExtras,
  type MissaoNoRastreador,
  type TopicoDoRastreador,
} from "@/services/missoes/rastreadorDeMissoes";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

import { BotaoDoRastreador } from "./BotaoDoRastreador";
import { comGuia, varianteDoRastreador, type VarianteDoRastreador } from "./variantesDoRastreador";

// Cores de estado fixas, como as do selo de prazo: não derivam do accent do perfil (AAA).
const ATENCAO = "#F5B544";
const CRITICA = "#FF6B6B";
const SUCESSO = "#4ADE80";

type Props = {
  classeId: number;
  /** `perfilDaMissao(usuario.perfis, usuario.perfilAtivo)` — o mesmo recorte da aba Social. */
  perfilDaMissao: string | null;
  topicos: readonly TopicoDoRastreador[];
  /** O tópico de retomada (`useTrailResumeTopic`). */
  atualId: string | null;
  palette: ProfileShellPalette;
  /** Distância do pé da tela. Na Trilha, a mesma do lançador do mentor: os dois ficam alinhados. */
  base: number;
  /** O perfil visual: moldura, emblema e progresso do ícone (`variantesDoRastreador`). */
  perfil: string | null | undefined;
  /** Esconde o botão (folha do tópico aberta por cima do mapa). A folha de missões não fecha. */
  oculto?: boolean;
  /** "Ir" de missão cujo tópico está selado: a Trilha mostra o tópico e o que falta para abrir. */
  onVerTopicoBloqueado: (topicoId: number) => void;
};

/**
 * O rastreador de missões da Trilha — o "quest tracker" dos jogos.
 *
 * Fechado, é só um ícone — moldura, emblema e progresso do perfil (`variantesDoRastreador`,
 * `BotaoDoRastreador`) e um selo com quantas estão em aberto —, no canto de baixo à esquerda,
 * na linha do mentor. Aberto, é uma folha com a lista: cada missão com progresso, prazo,
 * recompensa e o "Ir", que leva ao tópico — ou à atividade, na missão-entrega. A missão em
 * destaque é a da vez (critério em `ordenarParaRastreador`).
 *
 * Mesma fonte da aba Social, onde a lista continua: o que aparece, e se está cumprido, é o
 * servidor que diz. Recarrega a cada volta à Trilha, porque é estudando fora dela que a
 * missão anda.
 */
export function RastreadorDeMissoes({
  classeId,
  perfilDaMissao,
  topicos,
  atualId,
  palette,
  base,
  perfil,
  oculto,
  onVerTopicoBloqueado,
}: Props) {
  const [missoes, setMissoes] = useState<MissaoComExtras[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const lista = await carregarMissoesDoRastreador(classeId, perfilDaMissao);
      if (meu !== pedido.current) return;
      setMissoes(lista);
      setErro(false);
    } catch (e) {
      if (meu !== pedido.current) return;
      console.warn("[Rastreador de missões]", e);
      setErro(true);
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [classeId, perfilDaMissao]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const lista = useMemo(
    () => (missoes ? comDestino(missoes, topicos, atualId) : null),
    [atualId, missoes, topicos],
  );

  const ir = useCallback(
    (m: MissaoNoRastreador) => {
      if (!m.destino) return;
      if (m.destino.tipo === "bloqueado") {
        onVerTopicoBloqueado(m.destino.topicoId);
        return;
      }
      const rota = rotaDoDestino(m.destino);
      if (rota) router.push(rota);
    },
    [onVerTopicoBloqueado],
  );

  return (
    <PainelDeMissoes
      missoes={lista}
      atualId={atualId}
      carregando={carregando}
      erro={erro}
      palette={palette}
      base={base}
      perfil={perfil}
      oculto={oculto}
      onAtualizar={() => void carregar()}
      onIr={ir}
    />
  );
}

type PropsDoPainel = {
  /** `null` = a primeira leitura ainda não respondeu. */
  missoes: MissaoNoRastreador[] | null;
  atualId: string | null;
  carregando: boolean;
  erro: boolean;
  palette: ProfileShellPalette;
  base: number;
  perfil: string | null | undefined;
  oculto?: boolean;
  onAtualizar: () => void;
  onIr: (m: MissaoNoRastreador) => void;
};

/** O botão e a folha, sem leitura nenhuma: recebe a lista pronta. */
export function PainelDeMissoes({
  missoes,
  atualId,
  carregando,
  erro,
  palette,
  base,
  perfil,
  oculto,
  onAtualizar,
  onIr,
}: PropsDoPainel) {
  const [aberto, setAberto] = useState(false);
  const insets = useSafeAreaInsets();

  const { atual, abertas, encerradas } = useMemo(
    () => montarRastreador(missoes ?? [], atualId),
    [atualId, missoes],
  );

  const ir = (m: MissaoNoRastreador) => {
    setAberto(false);
    onIr(m);
  };

  // Primeira carga sem resposta: nada. Um botão vazio piscando antes da lista é ruído.
  if (missoes === null && !erro) return null;

  const variante = varianteDoRastreador(perfil);
  const guia = getBrainHexGuideName(variante.perfil);
  const pendentes = abertas.length;
  // Na linha do mentor, acima da folha do tópico: o lugar é o mesmo em todos os perfis.
  const posicao = { left: 16, bottom: base };

  return (
    <>
      {!oculto ? (
        <BotaoDoRastreador
          variante={variante}
          guia={guia}
          atual={atual}
          abertas={abertas}
          encerradas={encerradas}
          palette={palette}
          posicao={posicao}
          onPress={() => setAberto(true)}
        />
      ) : null}

      <Modal visible={aberto} transparent animationType="slide" onRequestClose={() => setAberto(false)}>
        <View style={s.modalRaiz}>
          <Pressable
            style={[StyleSheet.absoluteFill, s.fundo]}
            onPress={() => setAberto(false)}
            accessibilityRole="button"
            accessibilityLabel="Fechar missões"
          />
          <View
            style={[
              s.folha,
              {
                backgroundColor: palette.surface,
                borderColor: palette.borderStrong,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={[s.alca, { backgroundColor: palette.border }]} />
            <View style={s.cabecalho}>
              <MaterialCommunityIcons name={variante.emblema as never} size={22} color={palette.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[s.folhaTitulo, { color: palette.text }]} accessibilityRole="header">
                  {comGuia(variante.tituloDaFolha, guia)}
                </Text>
                <Text style={[s.folhaSub, { color: palette.textMuted }]}>
                  {pendentes === 0
                    ? "Missões · nenhuma em aberto agora"
                    : pendentes === 1
                      ? "Missões · 1 em aberto"
                      : `Missões · ${pendentes} em aberto`}
                </Text>
              </View>
              <Pressable
                onPress={onAtualizar}
                hitSlop={8}
                style={s.iconeToque}
                accessibilityRole="button"
                accessibilityLabel="Atualizar missões"
              >
                {carregando ? (
                  <ActivityIndicator size="small" color={palette.textMuted} />
                ) : (
                  <MaterialCommunityIcons name="refresh" size={20} color={palette.textMuted} />
                )}
              </Pressable>
              <Pressable
                onPress={() => setAberto(false)}
                hitSlop={8}
                style={s.iconeToque}
                accessibilityRole="button"
                accessibilityLabel="Fechar missões"
              >
                <MaterialCommunityIcons name="close" size={22} color={palette.text} />
              </Pressable>
            </View>

            <ScrollView style={s.rolagem} contentContainerStyle={s.rolagemConteudo}>
              {erro && !missoes ? (
                <Text style={[s.aviso, { color: palette.textMuted }]}>
                  Não foi possível carregar suas missões. Toque em atualizar para tentar de novo.
                </Text>
              ) : null}

              {missoes && pendentes === 0 ? (
                <Text style={[s.aviso, { color: palette.textMuted }]}>
                  {encerradas.length
                    ? "Você cumpriu todas as missões de agora. As do dia renovam depois da meia-noite."
                    : "Ainda não há missão para você. As do dia aparecem depois da meia-noite."}
                </Text>
              ) : null}

              {abertas.map((m, i) => (
                <CartaoDeMissao key={m.id} missao={m} destaque={i === 0} variante={variante} guia={guia} palette={palette} onIr={() => ir(m)} />
              ))}

              {encerradas.length ? (
                <Text style={[s.secao, { color: palette.textMuted }]}>ENCERRADAS</Text>
              ) : null}
              {encerradas.map((m) => (
                <CartaoDeMissao key={m.id} missao={m} destaque={false} variante={variante} guia={guia} palette={palette} onIr={() => ir(m)} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CartaoDeMissao({
  missao: m,
  destaque,
  variante,
  guia,
  palette,
  onIr,
}: {
  missao: MissaoNoRastreador;
  destaque: boolean;
  variante: VarianteDoRastreador;
  guia: string;
  palette: ProfileShellPalette;
  onIr: () => void;
}) {
  const cumprida = m.status === "concluida";
  const expirada = m.status === "expirada";
  const emAberto = !cumprida && !expirada;
  const pct = percentualDaMissao(m);
  const prazo = emAberto ? prazoDaMissao(m.prazo) : null;
  const corPrazo = prazo?.urgencia === "critica" ? CRITICA : prazo?.urgencia === "atencao" ? ATENCAO : palette.textMuted;
  const recompensa = rotuloDaRecompensa(m.recompensa);
  const origem = m.origem === "professor" ? "Do professor" : "Do dia";
  const meta = [origem, rotuloDoEscopo(m.escopo), m.criterioRotulo].filter(Boolean).join(" · ");
  const bloqueado = m.destino?.tipo === "bloqueado";

  return (
    <View
      style={[
        s.cartao,
        {
          backgroundColor: destaque ? palette.accentMuted : palette.surfaceElevated,
          borderColor: destaque ? palette.accent : palette.border,
          opacity: emAberto ? 1 : 0.72,
        },
      ]}
    >
      {destaque ? (
        <Text style={[s.eyebrow, { color: palette.accent }]}>
          {comGuia(m.categoria === "principal" ? variante.rotuloPrincipal : variante.rotulo, guia, true)}
        </Text>
      ) : null}
      <View style={s.cartaoTopo}>
        <MaterialCommunityIcons
          name={cumprida ? "check-circle" : expirada ? "timer-sand-complete" : m.origem === "professor" ? "school" : "calendar-today"}
          size={20}
          color={cumprida ? SUCESSO : expirada ? palette.textSubtle : palette.accent}
        />
        <Text style={[s.cartaoTitulo, { color: palette.text }]} numberOfLines={2}>
          {m.titulo}
        </Text>
      </View>
      {m.descricao ? (
        <Text style={[s.descricao, { color: palette.textMuted }]} numberOfLines={2}>
          {m.descricao}
        </Text>
      ) : null}
      <Text style={[s.meta, { color: palette.textMuted }]} numberOfLines={2}>
        {meta}
      </Text>

      <View style={s.progressoLinha}>
        <View style={[s.trilho, s.trilhoCartao, { backgroundColor: palette.progressTrack }]}>
          <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: cumprida ? SUCESSO : palette.accent }]} />
        </View>
        <Text style={[s.pct, { color: palette.text }]}>{cumprida ? "Cumprida" : expirada ? "Expirou" : `${pct}%`}</Text>
      </View>

      <View style={s.rodape}>
        <View style={s.chips}>
          {prazo ? (
            <View style={[s.chip, { borderColor: corPrazo }]}>
              <MaterialCommunityIcons name="calendar-clock" size={12} color={corPrazo} />
              <Text style={[s.chipTexto, { color: corPrazo }]}>{prazo.rotulo}</Text>
            </View>
          ) : null}
          {recompensa ? (
            <View style={[s.chip, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <MaterialCommunityIcons name="gift-open-outline" size={12} color={palette.accent} />
              <Text style={[s.chipTexto, { color: palette.text }]}>{recompensa}</Text>
            </View>
          ) : null}
        </View>
        {emAberto && m.destino ? (
          <Pressable
            onPress={onIr}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              bloqueado ? `Ver o que falta para abrir o tópico da missão ${m.titulo}` : `Ir para a missão ${m.titulo}`
            }
            style={({ pressed }) => [
              s.ir,
              bloqueado
                ? { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }
                : { backgroundColor: palette.accent },
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <MaterialCommunityIcons
              name={bloqueado ? "lock-outline" : "arrow-right-bold"}
              size={16}
              color={bloqueado ? palette.text : palette.background}
            />
            <Text style={[s.irTexto, { color: bloqueado ? palette.text : palette.background }]}>
              {bloqueado ? "Ver" : "Ir"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  trilho: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  trilhoCartao: { flex: 1, height: 6, borderRadius: 3, marginTop: 0 },
  preenchido: { height: "100%", borderRadius: 3 },
  modalRaiz: { flex: 1, justifyContent: "flex-end" },
  fundo: { backgroundColor: "rgba(0,0,0,0.5)" },
  folha: {
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  alca: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginTop: 10 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  folhaTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  folhaSub: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  iconeToque: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rolagem: { flexShrink: 1 },
  rolagemConteudo: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, gap: 10 },
  aviso: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 20, paddingVertical: 8 },
  secao: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1, marginTop: 8 },
  cartao: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  cartaoTopo: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cartaoTitulo: { flex: 1, fontFamily: FontFamily.inikaBold, fontSize: 15, lineHeight: 20 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18 },
  meta: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
  progressoLinha: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  pct: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", minWidth: 36, textAlign: "right" },
  rodape: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  chips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700" },
  ir: {
    minHeight: 44,
    minWidth: 76,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  irTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
