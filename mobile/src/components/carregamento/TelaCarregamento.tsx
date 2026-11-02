/**
 * Tela de carregamento do TrailUp, personalizada pelo perfil BrainHex.
 *
 * - Centro: o ícone do perfil num medalhão, chapado e na cor de destaque (o mesmo glifo
 *   de `brainHexConfig` que o app já usa, não o emblema 3D); na variante neutra, a
 *   estrela da marca.
 * - Embaixo: a "trilha de marcos", indicador indeterminado cujo modo e ritmo saem
 *   da assinatura editorial do perfil (ver `utils/telaCarregamento.ts`).
 * - Quando o perfil chega com a tela aberta, a variante neutra se transforma na do
 *   perfil: a estrela gira e se apaga, um círculo na cor do perfil sai do medalhão e
 *   cobre a tela, e o símbolo e o texto do perfil entram (FASES_DA_TRANSICAO).
 * - Com "Reduzir movimento" ligado, nada se move: os marcos ficam parados, a troca de
 *   variante é instantânea e o texto continua dizendo que está carregando.
 * - Depois de 10 s a tela avisa que está demorando, e o aviso é anunciado ao
 *   leitor de tela.
 *
 * Fundamentação em docs/superpowers/specs/2026-11-02-tela-de-carregamento-por-perfil-design.md.
 */
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { designStar } from "@/constants/designAssets";
import { brainHexConfig } from "@/constants/profileImages";
import { useMovimentoReduzido } from "@/hooks/useMovimentoReduzido";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  ATRASO_PARA_MOSTRAR_MS,
  CARREGAMENTO_POR_PERFIL,
  FASES_DA_TRANSICAO,
  INTENSIDADE_PARADA,
  LIMIAR_DEMORA_MS,
  MARCOS_NA_TRILHA,
  TRANSICAO_MS,
  circuloDaTransicao,
  curvaDoMarco,
  desacelerar,
  deveAnimarTransicao,
  escolherFrase,
  faseDaTransicao,
  paletaDoCarregamento,
  perfilDoCarregamento,
  rotuloDoGuia,
  type PerfilDoCarregamento,
} from "@/utils/telaCarregamento";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import tinycolor from "tinycolor2";

// Só opacidade e transform são animados, então o driver nativo serve a todos os nós
// (o Loading.tsx antigo precisava do JS driver porque animava cor e sombra). Na web
// não existe driver nativo.
const DRIVER_NATIVO = Platform.OS !== "web";

export type TelaCarregamentoProps = {
  /** Perfil BrainHex (qualquer grafia aceita por `normalizeBrainHexProfile`); sem ele, variante neutra. */
  perfil?: string | null;
  /** O que está carregando: "Carregando trilha", "Preparando sua sessão"... */
  titulo: string;
  /** Texto do contexto. Na variante neutra substitui a frase; com perfil, quem fala é o guia. */
  mensagem?: string;
  /** Cor-assinatura vinda de fora (ex.: `LoadingState color`). Também passa pelo ajuste AAA. */
  corDestaque?: string | null;
  /** Cobre a tela inteira, por cima de tudo (a abertura do app). */
  sobreposta?: boolean;
  /** Fixa a frase sorteada (prints e testes). */
  sorteioDaFrase?: number;
};

function fraseDe(chave: PerfilDoCarregamento, mensagem: string | undefined, sorteio: number) {
  return chave === "neutro" && mensagem ? mensagem : escolherFrase(chave, sorteio);
}

export function TelaCarregamento({
  perfil,
  titulo,
  mensagem,
  corDestaque,
  sobreposta = false,
  sorteioDaFrase,
}: TelaCarregamentoProps) {
  const chave = perfilDoCarregamento(perfil);
  const reduzido = useMovimentoReduzido();
  const { width, height } = useWindowDimensions();

  // `mostrada` é a variante desenhada por cima; `saindo`, a que está sendo coberta
  // durante a transição (nula fora dela).
  const [mostrada, setMostrada] = useState(chave);
  const [saindo, setSaindo] = useState<PerfilDoCarregamento | null>(null);
  const revelar = useRef(new Animated.Value(1)).current;

  // Antes de pintar: senão o primeiro quadro já mostraria o perfil inteiro, e só
  // depois a transição começaria do zero.
  useLayoutEffect(() => {
    if (chave === mostrada) return;
    if (deveAnimarTransicao(mostrada, chave, reduzido)) {
      revelar.setValue(0);
      setSaindo(mostrada);
    } else {
      revelar.setValue(1);
      setSaindo(null);
    }
    setMostrada(chave);
  }, [chave, mostrada, reduzido, revelar]);

  useEffect(() => {
    if (!saindo) return;
    const terminar = () => {
      revelar.setValue(1);
      setSaindo(null);
    };
    const anim = Animated.timing(revelar, {
      toValue: 1,
      duration: TRANSICAO_MS,
      easing: Easing.linear,
      useNativeDriver: DRIVER_NATIVO,
    });
    anim.start(({ finished }) => finished && terminar());
    // Com a aba em segundo plano o requestAnimationFrame para; o timer garante que a
    // transição não fique presa no meio.
    const seguranca = setTimeout(terminar, TRANSICAO_MS + 400);
    return () => {
      anim.stop();
      clearTimeout(seguranca);
    };
  }, [saindo, revelar]);

  // Uma frase por montagem: trocar de frase a cada poucos segundos faria o leitor de
  // tela anunciar de novo e seria conteúdo que se atualiza sozinho (WCAG 2.2.2).
  const [sorteio] = useState(() => sorteioDaFrase ?? Math.random());

  // Espera curta não pede indicador: o fundo entra na hora (sem piscar branco) e o
  // conteúdo só depois de ATRASO_PARA_MOSTRAR_MS. Por timer, não por animação: com a aba
  // em segundo plano o requestAnimationFrame para, e um fade de entrada deixaria a tela
  // vazia até a aba voltar.
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), ATRASO_PARA_MOSTRAR_MS);
    return () => clearTimeout(t);
  }, []);

  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), LIMIAR_DEMORA_MS);
    return () => clearTimeout(t);
  }, []);

  const volta = useRef(new Animated.Value(0)).current;
  const { cicloMs } = CARREGAMENTO_POR_PERFIL[mostrada].movimento;
  useEffect(() => {
    if (reduzido) {
      volta.stopAnimation();
      return;
    }
    volta.setValue(0);
    const anim = Animated.loop(
      Animated.timing(volta, {
        toValue: 1,
        duration: cicloMs,
        easing: Easing.linear,
        useNativeDriver: DRIVER_NATIVO,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [volta, reduzido, cicloMs]);

  const avisoDemora = CARREGAMENTO_POR_PERFIL[mostrada].voz.demora;
  useEffect(() => {
    // Região viva só existe no Android; no iOS e na web o anúncio é explícito.
    if (demorou) AccessibilityInfo.announceForAccessibility?.(avisoDemora);
  }, [demorou, avisoDemora]);

  // Cada parte vira uma frase (o leitor de tela pausa no ponto), sem dobrar a pontuação que já vem.
  const rotuloAcessivel = [titulo, fraseDe(mostrada, mensagem, sorteio), demorou ? avisoDemora : null]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => (/[.!?…]$/.test(parte) ? parte : `${parte}.`))
    .join(" ");

  const fundo = paletaDoCarregamento(saindo ?? mostrada, corDestaque).fundo;
  const circulo = circuloDaTransicao(MOLDURA, width, height);
  const comum = { titulo, mensagem, corDestaque, sorteio, volta, reduzido, visivel, demorou, revelar, circulo };

  return (
    <View
      style={[styles.container, sobreposta && styles.sobreposta, { backgroundColor: fundo }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rotuloAcessivel}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      aria-busy
      testID="tela-carregamento"
    >
      {saindo && <Camada key={`saindo-${saindo}`} chave={saindo} papel="saindo" {...comum} />}
      <Camada key={mostrada} chave={mostrada} papel={saindo ? "entrando" : "fixa"} {...comum} />
    </View>
  );
}

type PapelDaCamada = "fixa" | "saindo" | "entrando";

type CamadaProps = {
  chave: PerfilDoCarregamento;
  papel: PapelDaCamada;
  titulo: string;
  mensagem?: string;
  corDestaque?: string | null;
  sorteio: number;
  volta: Animated.Value;
  reduzido: boolean;
  visivel: boolean;
  demorou: boolean;
  revelar: Animated.Value;
  circulo: { diametro: number; escalaInicial: number };
};

type Interpolado = Animated.AnimatedInterpolation<number | string>;
type AnimacaoDaCamada = Partial<
  Record<
    | "simboloOpacidade" | "simboloEscala" | "simboloGiro"
    | "fundoOpacidade" | "circuloEscala" | "circuloOpacidade" | "ondaEscala" | "ondaOpacidade"
    | "medalhaoOpacidade" | "medalhaoEscala" | "textoOpacidade",
    Interpolado
  >
>;

/** Uma variante inteira da tela (fundo e conteúdo). Na transição, duas ficam empilhadas. */
function Camada({
  chave,
  papel,
  titulo,
  mensagem,
  corDestaque,
  sorteio,
  volta,
  reduzido,
  visivel,
  demorou,
  revelar,
  circulo,
}: CamadaProps) {
  const paleta = useMemo(() => paletaDoCarregamento(chave, corDestaque), [chave, corDestaque]);
  const { movimento, voz } = CARREGAMENTO_POR_PERFIL[chave];
  const frase = fraseDe(chave, mensagem, sorteio);
  const rotulo = rotuloDoGuia(chave);
  const icone = chave === "neutro" ? null : brainHexConfig[chave].icon;

  const marcos = useMemo(
    () =>
      Array.from({ length: MARCOS_NA_TRILHA }, (_, i) => {
        if (reduzido) {
          return { opacity: INTENSIDADE_PARADA, scale: 1 };
        }
        const curva = curvaDoMarco(movimento.modo, i);
        const intensidade = volta.interpolate({ ...curva, extrapolate: "clamp" });
        return {
          opacity: intensidade,
          scale: intensidade.interpolate({ inputRange: [0, 1], outputRange: [1, movimento.escalaMaxima] }),
        };
      }),
    [reduzido, movimento.modo, movimento.escalaMaxima, volta],
  );

  const brilho = reduzido
    ? 0.5
    : volta.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.75, 0.3] });

  // Fora da transição, tudo parado no estado final.
  const anim = useMemo((): AnimacaoDaCamada => {
    const fase = (trecho: readonly [number, number], de: number, para: number, easing?: (t: number) => number) =>
      revelar.interpolate({ ...faseDaTransicao(trecho, de, para, easing), extrapolate: "clamp" });
    const f = FASES_DA_TRANSICAO;
    if (papel === "saindo") {
      return {
        simboloOpacidade: fase(f.estrelaSai, 1, 0),
        simboloEscala: fase(f.estrelaSai, 1, 1.3, desacelerar),
        simboloGiro: fase(f.estrelaSai, 0, 1, desacelerar).interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }),
      };
    }
    if (papel === "entrando") {
      return {
        fundoOpacidade: fase(f.fundoEntra, 0, 1),
        circuloEscala: fase(f.circulo, circulo.escalaInicial, 1, desacelerar),
        // Invisível até a sua fase (a estrela ainda está girando), aparece e, no fim, some no cenário.
        circuloOpacidade: revelar.interpolate({
          inputRange: [0, f.circulo[0], f.circulo[0] + 0.03, f.circuloSai[0], f.circuloSai[1]],
          outputRange: [0, 0, 1, 1, 0],
          extrapolate: "clamp",
        }),
        ondaEscala: fase(f.onda, circulo.escalaInicial, 1, desacelerar),
        ondaOpacidade: revelar.interpolate({
          inputRange: [0, f.onda[0] + 0.05, f.onda[1]],
          outputRange: [0, 0.7, 0],
          extrapolate: "clamp",
        }),
        medalhaoOpacidade: fase(f.medalhaoEntra, 0, 1),
        medalhaoEscala: fase(f.medalhaoEntra, 0.82, 1, desacelerar),
        textoOpacidade: fase(f.textoEntra, 0, 1),
      };
    }
    return {};
  }, [papel, revelar, circulo.escalaInicial]);

  const { diametro } = circulo;
  const posicaoDoCirculo = {
    width: diametro,
    height: diametro,
    borderRadius: diametro / 2,
    left: (MEDALHAO - diametro) / 2,
    top: (MEDALHAO - diametro) / 2,
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.camada, { pointerEvents: "none" }]}>
      {/* A camada que entra não pinta fundo próprio: quem cobre a anterior é o círculo. */}
      {papel !== "entrando" && <View style={[StyleSheet.absoluteFill, { backgroundColor: paleta.fundo }]} />}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim.fundoOpacidade ?? 1 }]}>
        <HallBackground palette={paleta.base} />
        <LinearGradient
          colors={[tinycolor(paleta.destaque).setAlpha(0.22).toRgbString(), "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.luz]}
        />
      </Animated.View>

      <View style={[styles.conteudo, { opacity: visivel ? 1 : 0 }]}>
        <View style={styles.medalhao} importantForAccessibility="no-hide-descendants">
          {papel === "entrando" && (
            <>
              <Animated.View
                style={[
                  styles.circulo,
                  posicaoDoCirculo,
                  {
                    backgroundColor: tinycolor(paleta.destaque).setAlpha(0.35).toRgbString(),
                    opacity: anim.ondaOpacidade,
                    transform: [{ scale: anim.ondaEscala ?? 1 }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.circulo,
                  posicaoDoCirculo,
                  {
                    backgroundColor: paleta.fundo,
                    opacity: anim.circuloOpacidade,
                    transform: [{ scale: anim.circuloEscala ?? 1 }],
                  },
                ]}
              />
            </>
          )}
          <Animated.View
            style={[
              styles.medalhaoInterno,
              { opacity: anim.medalhaoOpacidade ?? 1, transform: [{ scale: anim.medalhaoEscala ?? 1 }] },
            ]}
          >
            <Animated.View
              style={[styles.halo, { backgroundColor: tinycolor(paleta.destaque).setAlpha(0.28).toRgbString(), opacity: brilho }]}
            />
            <View style={[styles.moldura, { borderColor: paleta.anel, backgroundColor: paleta.superficie }]}>
              <Animated.View
                style={{
                  opacity: anim.simboloOpacidade ?? 1,
                  transform: [{ rotate: anim.simboloGiro ?? "0deg" }, { scale: anim.simboloEscala ?? 1 }],
                }}
              >
                {icone ? (
                  // Glifo chapado: combina com o traço do medalhão e da trilha, e o destaque
                  // já passa de 7:1 sobre a superfície (1.4.11 pede 3:1).
                  <MaterialCommunityIcons name={icone} size={ICONE} color={paleta.destaque} accessible={false} />
                ) : (
                  <Image source={designStar} style={styles.estrela} resizeMode="contain" accessible={false} />
                )}
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.textos, { opacity: anim.textoOpacidade ?? 1 }]}>
          {/* Linha reservada também na neutra: as duas variantes têm o mesmo layout, e a
              transição troca uma pela outra no lugar, sem nada pular. */}
          <Text style={[styles.rotulo, { color: paleta.destaque }]} numberOfLines={2}>
            {rotulo ?? " "}
          </Text>
          <View style={styles.ornamento}>
            <OrnamentDivider color={paleta.destaque} />
          </View>
          <Text style={[styles.titulo, { color: paleta.texto }]}>{titulo}</Text>
          <Text style={[styles.frase, { color: paleta.textoSuave }]}>{frase}</Text>

          <View style={styles.trilha} importantForAccessibility="no-hide-descendants">
            <View style={[styles.caminho, { backgroundColor: paleta.marcoApagado }]} />
            {marcos.map((marco, i) => (
              <View key={i} style={styles.vaga}>
                <View style={[styles.marco, { backgroundColor: paleta.fundo, borderColor: paleta.marcoApagado }]} />
                <Animated.View
                  style={[
                    styles.marco,
                    styles.marcoAceso,
                    {
                      backgroundColor: paleta.destaque,
                      borderColor: paleta.destaque,
                      opacity: marco.opacity,
                      transform: [{ rotate: "45deg" }, { scale: marco.scale }],
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Espaço reservado: o aviso entra sem empurrar o medalhão (mudança de layout também é movimento). */}
          <View style={styles.vagaDaDemora}>
            {demorou && (
              <View style={[styles.demora, { backgroundColor: paleta.superficie, borderColor: tinycolor(paleta.destaque).setAlpha(0.45).toRgbString() }]}>
                <Text style={[styles.demoraTexto, { color: paleta.texto }]}>{voz.demora}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const MEDALHAO = 168;
const MOLDURA = 140;
const ICONE = 64;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Ocupa a largura toda mesmo dentro de um pai com alignItems: "center":
    // sem isso, na web o fundo cobria só a faixa do texto e as laterais ficavam brancas.
    alignSelf: "stretch",
    overflow: "hidden",
  },
  sobreposta: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  camada: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  luz: { height: "50%", pointerEvents: "none" },
  conteudo: { width: "100%", maxWidth: 360, alignItems: "center" },
  medalhao: {
    width: MEDALHAO,
    height: MEDALHAO,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  circulo: { position: "absolute" },
  medalhaoInterno: {
    width: MEDALHAO,
    height: MEDALHAO,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: MEDALHAO,
    height: MEDALHAO,
    borderRadius: MEDALHAO / 2,
  },
  moldura: {
    width: MOLDURA,
    height: MOLDURA,
    borderRadius: MOLDURA / 2,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  estrela: { width: 96, height: 96 },
  textos: { width: "100%", alignItems: "center" },
  rotulo: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 18,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  ornamento: { width: "72%", marginVertical: 6 },
  titulo: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
    marginBottom: 6,
  },
  frase: {
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    minHeight: 44,
  },
  trilha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 184,
    height: 28,
    marginTop: 22,
  },
  caminho: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
  vaga: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  marco: {
    position: "absolute",
    width: 11,
    height: 11,
    borderWidth: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  marcoAceso: { borderWidth: 0 },
  vagaDaDemora: { width: "100%", minHeight: 96, marginTop: 24, alignItems: "center" },
  demora: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  demoraTexto: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
