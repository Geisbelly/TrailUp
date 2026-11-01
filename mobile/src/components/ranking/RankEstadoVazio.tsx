import { getProfileArtwork } from "@/constants/designAssets";
import { guardianFullImages } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { coresDoRankVazio, textoSemRank, type MotivoSemRank } from "@/utils/rankEstadoVazio";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  motivo: MotivoSemRank;
  palette: ProfileShellPalette;
  /** Perfil visual do aluno: escolhe a arena e o guardião do cartão. */
  profile?: string | null;
  /** Critério da categoria aberta; muda a dica de "ninguém pontuou". */
  criterio?: string | null;
  /** Ação "Tentar de novo" (erro e categoria não encontrada). */
  onTentarDeNovo?: () => Promise<void> | void;
  /** Ação "Ver Geral" (filtro sem ninguém). */
  onVerGeral?: () => void;
  /** Sem a arte: dentro da lista (filtro vazio) ou no rodapé (aluno sem posição). */
  compacto?: boolean;
};

/**
 * Cartão de "sem rank" (mobile-v1): a arena do perfil ao fundo, o guardião apresentando
 * o pódio vazio, e embaixo o porquê e a saída — Trilha, tentar de novo ou voltar ao Geral.
 * O motivo e os textos saem de `utils/rankEstadoVazio.ts`; aqui é só o desenho.
 */
export function RankEstadoVazio({ motivo, palette, profile, criterio, onTentarDeNovo, onVerGeral, compacto = false }: Props) {
  const router = useRouter();
  const [tentando, setTentando] = useState(false);
  const c = coresDoRankVazio(palette);
  const t = textoSemRank(motivo, criterio);
  const carregando = motivo === "carregando" || tentando;

  const agir = async () => {
    if (t.acao === "trilha") {
      router.push("/(tabs)/trilha");
      return;
    }
    if (t.acao === "geral") {
      onVerGeral?.();
      return;
    }
    if (t.acao === "tentar" && onTentarDeNovo) {
      setTentando(true);
      try {
        await onTentarDeNovo();
      } finally {
        setTentando(false);
      }
    }
  };
  // Sem quem execute, o botão não aparece: melhor nenhum botão que um que não faz nada.
  const temAcao =
    t.acao === "trilha" || (t.acao === "geral" && !!onVerGeral) || (t.acao === "tentar" && !!onTentarDeNovo);
  // Trilha é o caminho principal (botão cheio); tentar de novo e Geral são secundários (contorno).
  const principal = t.acao === "trilha";

  const selo = (
    <View style={[s.selo, compacto && s.seloCompacto, { backgroundColor: c.seloFundo, borderColor: c.seloBorda }]}>
      <MaterialCommunityIcons name={t.icone as never} size={compacto ? 20 : 22} color={c.icone} />
    </View>
  );

  const botao = temAcao ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.rotuloAcao}
      accessibilityState={{ busy: tentando, disabled: tentando }}
      disabled={tentando}
      onPress={() => void agir()}
      style={({ pressed }) => [
        s.botao,
        compacto && s.botaoCompacto,
        principal
          ? { backgroundColor: c.botaoFundo, borderColor: c.botaoFundo, opacity: pressed ? 0.85 : 1 }
          : { backgroundColor: pressed ? c.pressionado : c.cartao, borderColor: c.botaoSecundarioBorda },
      ]}
    >
      {tentando ? (
        <ActivityIndicator size="small" color={c.botaoSecundarioTexto} />
      ) : (
        <MaterialCommunityIcons
          name={t.acao === "trilha" ? "map-marker-path" : t.acao === "geral" ? "format-list-numbered" : "refresh"}
          size={18}
          color={principal ? c.botaoTexto : c.botaoSecundarioTexto}
        />
      )}
      <Text style={[s.botaoTexto, { color: principal ? c.botaoTexto : c.botaoSecundarioTexto }]}>
        {tentando ? "Tentando…" : t.rotuloAcao}
      </Text>
    </Pressable>
  ) : null;

  if (compacto) {
    return (
      <View style={[s.cartao, s.cartaoCompacto, { backgroundColor: c.cartao, borderColor: c.borda }]}>
        <View style={s.linhaCompacta}>
          {selo}
          <View style={s.textosCompactos}>
            <Text accessibilityRole="header" style={[s.tituloCompacto, { color: c.titulo }]}>{t.titulo}</Text>
            <Text style={[s.texto, s.textoCompacto, { color: c.texto }]}>{t.texto}</Text>
            {/* No rodapé e no meio da lista o cartão não pode empurrar a classificação: o botão vira pílula. */}
            {botao}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityLiveRegion={motivo === "erro" ? "assertive" : "polite"}
      style={[s.cartao, { backgroundColor: c.cartao, borderColor: c.borda }]}
    >
      <View style={[s.arte, { pointerEvents: "none" }]} accessible={false}>
        <Image source={getProfileArtwork(profile, "rank")} resizeMode="cover" style={s.arena} />
        {/* Corpo inteiro (fundo transparente), não o retrato: o rosto vem recortado num quadrado escuro. */}
        <Image
          source={guardianFullImages[normalizeBrainHexProfile(profile) ?? "mastermind"]}
          resizeMode="contain"
          style={s.guardiao}
        />
        <LinearGradient
          colors={[`${c.cartao}26`, `${c.cartao}00`, c.cartao]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={s.corpo}>
        {/* O selo sobe sobre a arte; "Sala de honra" já é o título da tela, não se repete aqui. */}
        <View style={s.cabecalho}>{selo}</View>
        <Text accessibilityRole={motivo === "erro" ? "alert" : "header"} style={[s.titulo, { color: c.titulo }]}>
          {t.titulo}
        </Text>
        <Text style={[s.texto, { color: c.texto }]}>{t.texto}</Text>
        {carregando && !tentando ? <ActivityIndicator color={c.icone} style={s.indicador} /> : null}
        {botao}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  arte: { height: 140, overflow: "hidden" },
  arena: { width: "100%", height: "100%", opacity: 0.7 },
  // O guardião fica de pé à direita, apresentando o pódio vazio; da cintura para baixo some no degradê.
  guardiao: { position: "absolute", right: 4, top: 6, width: 150, height: 190 },
  corpo: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18, gap: 8 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -26, marginBottom: 2 },
  selo: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  seloCompacto: { width: 38, height: 38, borderRadius: 19 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 20, lineHeight: 26 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  indicador: { alignSelf: "flex-start", marginTop: 4 },
  botao: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  botaoCompacto: { alignSelf: "flex-start", minHeight: 44, marginTop: 6, borderRadius: 999, paddingHorizontal: 14 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700" },
  cartaoCompacto: { padding: 14 },
  linhaCompacta: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  textosCompactos: { flex: 1, minWidth: 0, gap: 4 },
  tituloCompacto: { fontFamily: FontFamily.inikaBold, fontSize: 16, lineHeight: 21 },
  textoCompacto: { fontSize: 13, lineHeight: 19 },
});
