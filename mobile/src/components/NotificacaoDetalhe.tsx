import { getProfileArtwork } from "@/constants/designAssets";
import type { IconeDaAcao } from "@/services/acaoDaNotificacao";
import { FontFamily } from "@/styles/GlobalStyle";
import { iconeDaNotificacao } from "@/utils/iconeNotificacao";
import { coresDoDetalheDaNotificacao } from "@/utils/notificacaoDetalheCores";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  perfil: string | null | undefined;
  titulo: string;
  corpo: string;
  tipo: string | null | undefined;
  lida: boolean;
  /** "há 1 h", "ontem às 14:00"… — vazio quando a notificação não tem data. */
  quando: string;
  /** Data e hora completas, para consulta precisa. */
  quandoCompleto: string;
  onMarcarNaoLida: () => void;
  onExcluir: () => void;
  /** Silenciar o tipo desta notificação (#149). Ausente: o tipo não pode ser silenciado. */
  onSilenciar?: () => void;
  /**
   * Ir ver aquilo de que a notificação fala ("Ver material", "Ver ranking"…). Ausente: a
   * notificação não aponta para um lugar conhecido, e o botão não aparece.
   */
  acao?: { rotulo: string; icone: IconeDaAcao; onPress: () => void } | null;
  /** Alvos do guia da seção (cabeçalho, mensagem e ações). */
  cabecalhoRef?: React.Ref<View>;
  corpoRef?: React.Ref<View>;
  acoesRef?: React.Ref<View>;
};

/**
 * Detalhe de uma notificação no visual do app (mobile-v1): paleta do perfil, cartões de
 * borda fina, Inika no título e Inter no texto, ícone por tipo como na caixa de entrada e
 * a arte do perfil no topo. Só apresentação: buscar, marcar e excluir ficam na rota
 * (`app/(tabs)/notificacoes/[id].tsx`).
 */
export function NotificacaoDetalheView({
  perfil,
  titulo,
  corpo,
  tipo,
  lida,
  quando,
  quandoCompleto,
  onMarcarNaoLida,
  onExcluir,
  onSilenciar,
  acao,
  cabecalhoRef,
  corpoRef,
  acoesRef,
}: Props) {
  const palette = React.useMemo(() => getProfileShellPalette(perfil), [perfil]);
  const c = coresDoDetalheDaNotificacao(palette, lida);

  return (
    <View style={s.tela}>
      <ScrollView
        contentContainerStyle={[s.conteudo, acao ? s.conteudoComAcao : null]}
        showsVerticalScrollIndicator={false}
      >
        <View
          ref={cabecalhoRef}
          collapsable={false}
          style={[s.cartao, { backgroundColor: c.cartao, borderColor: c.borda }]}
        >
          <View accessible={false} style={[s.arte, { pointerEvents: "none" }]}>
            <Image source={getProfileArtwork(perfil, "banner")} resizeMode="cover" style={s.arteImagem} />
            <LinearGradient
              colors={["transparent", c.cartao]}
              locations={[0.15, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={s.cabecalho}>
            <View style={s.linhaIcone}>
              <View style={[s.icone, { backgroundColor: c.iconeFundo, borderColor: c.bordaForte }]}>
                <MaterialCommunityIcons name={iconeDaNotificacao(tipo, titulo)} size={24} color={c.icone} />
              </View>
              <View style={[s.selo, { backgroundColor: c.seloFundo, borderColor: c.seloBorda }]}>
                <MaterialCommunityIcons
                  name={lida ? "email-open-outline" : "email-alert-outline"}
                  size={13}
                  color={c.seloTexto}
                />
                <Text style={[s.seloTexto, { color: c.seloTexto }]}>{lida ? "LIDA" : "NOVA"}</Text>
              </View>
            </View>

            <Text accessibilityRole="header" style={[s.titulo, { color: c.titulo }]}>
              {titulo}
            </Text>

            {quando ? (
              <View style={s.quando}>
                <View style={s.quandoLinha}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color={c.textoMudo} />
                  <Text style={[s.quandoTexto, { color: c.textoMudo }]}>{quando}</Text>
                </View>
                <Text style={[s.quandoCompleto, { color: c.textoSutil }]}>Enviada em {quandoCompleto}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          ref={corpoRef}
          collapsable={false}
          style={[s.cartao, s.cartaoCorpo, { backgroundColor: c.cartao, borderColor: c.borda }]}
        >
          <Text style={[s.rotulo, { color: c.textoSutil }]}>MENSAGEM</Text>
          <Text style={[s.mensagem, { color: c.texto }]}>{corpo}</Text>
        </View>

        {onSilenciar ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Para de receber notificações deste tipo. Dá para desfazer em Modo foco e avisos."
            onPress={onSilenciar}
            style={({ pressed }) => [s.silenciar, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="bell-off-outline" size={16} color={c.textoMudo} />
            <Text style={[s.silenciarTexto, { color: c.textoMudo }]}>Não quero avisos assim</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View
        ref={acoesRef}
        collapsable={false}
        style={[s.rodape, { backgroundColor: c.fundo, borderTopColor: c.borda }]}
      >
        {acao ? (
          <Pressable
            accessibilityRole="button"
            onPress={acao.onPress}
            style={({ pressed }) => [
              s.botao,
              s.acaoPrincipal,
              { backgroundColor: c.acaoFundo, borderColor: c.acaoFundo, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialCommunityIcons name={acao.icone} size={18} color={c.acaoTexto} />
            <Text style={[s.botaoTexto, { color: c.acaoTexto }]}>{acao.rotulo}</Text>
          </Pressable>
        ) : null}
        <View style={s.rodapeLinha}>
          {lida ? (
            <Pressable
              accessibilityRole="button"
              onPress={onMarcarNaoLida}
              style={({ pressed }) => [
                s.botao,
                s.botaoLargo,
                { backgroundColor: pressed ? c.iconeFundo : c.cartao, borderColor: c.bordaForte },
              ]}
            >
              <MaterialCommunityIcons name="email-mark-as-unread" size={18} color={c.icone} />
              <Text style={[s.botaoTexto, { color: c.texto }]}>Marcar como não lida</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onExcluir}
            style={({ pressed }) => [
              s.botao,
              // Ao lado de "Marcar como não lida", só a largura do texto: dividir ao meio
              // quebrava aquele rótulo em duas linhas em 360px.
              lida ? s.botaoCompacto : s.botaoLargo,
              { backgroundColor: pressed ? c.cartao : "transparent", borderColor: c.perigoBorda },
            ]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={c.perigoTexto} />
            <Text style={[s.botaoTexto, { color: c.perigoTexto }]}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Notificação que não existe mais (excluída em outro aparelho, link antigo). */
export function NotificacaoNaoEncontrada({ perfil }: { perfil: string | null | undefined }) {
  const palette = React.useMemo(() => getProfileShellPalette(perfil), [perfil]);
  return (
    <View style={s.vazio}>
      <View style={[s.cartao, s.vazioCartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={[s.icone, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong }]}>
          <MaterialCommunityIcons name="email-remove-outline" size={24} color={palette.accent} />
        </View>
        <Text accessibilityRole="header" style={[s.vazioTitulo, { color: palette.text }]}>Nada por aqui</Text>
        <Text style={[s.vazioTexto, { color: palette.textMuted }]}>Esta notificação não foi encontrada.</Text>
      </View>
    </View>
  );
}

const ICONE = 52;

const s = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    // Espaço para o rodapé fixo de ações.
    paddingBottom: 120,
    gap: 12,
  },
  // O botão de ação soma uma linha ao rodapé fixo.
  conteudoComAcao: { paddingBottom: 180 },
  cartao: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  arte: { height: 84 },
  arteImagem: { width: "100%", height: "100%" },
  cabecalho: { paddingHorizontal: 16, paddingBottom: 16, gap: 10, marginTop: -(ICONE / 2) },
  linhaIcone: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  icone: {
    width: ICONE,
    height: ICONE,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  seloTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 22, lineHeight: 28 },
  quando: { gap: 2 },
  quandoLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  quandoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  quandoCompleto: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  cartaoCorpo: { padding: 16, gap: 10 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  mensagem: { fontFamily: FontFamily.interMedium, fontSize: 15.5, lineHeight: 25 },
  silenciar: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  silenciarTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  rodape: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  rodapeLinha: { width: "100%", maxWidth: 600, alignSelf: "center", flexDirection: "row", gap: 10 },
  botao: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  botaoLargo: { flex: 1 },
  acaoPrincipal: { width: "100%", maxWidth: 600, alignSelf: "center", marginBottom: 10 },
  botaoCompacto: { paddingHorizontal: 18 },
  botaoTexto: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    fontWeight: "700",
  },
  vazio: { flex: 1, justifyContent: "center", paddingHorizontal: 16 },
  vazioCartao: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  vazioTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  vazioTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
