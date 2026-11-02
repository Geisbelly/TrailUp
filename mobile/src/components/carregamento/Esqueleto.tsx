/**
 * Esqueleto de carregamento: blocos no formato do conteúdo que ainda não chegou.
 *
 * - `EsqueletoGrupo` é o único nó acessível: uma barra de progresso ocupada, com
 *   rótulo ("Carregando ranking"). Os blocos dentro dele ficam fora da árvore.
 * - Todos os blocos de um grupo pulsam juntos, com um laço só: dez laços
 *   desencontrados piscariam, e um custa menos.
 * - Com "Reduzir movimento", nada pulsa: os blocos ficam parados.
 * - A cor sai da superfície do perfil, com a luminosidade elevada (`corDoEsqueleto`).
 *
 * O núcleo puro está em `utils/esqueleto.ts`.
 */
import { useMovimentoReduzido } from "@/hooks/useMovimentoReduzido";
import {
  OPACIDADE_DO_PULSO,
  OPACIDADE_PARADA,
  PULSO_MS,
  corDoEsqueleto,
  larguraDaLinha,
} from "@/utils/esqueleto";
import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";

const USAR_DRIVER_NATIVO = Platform.OS !== "web";

type ContextoDoEsqueleto = { cor: string; opacidade: Animated.Value | number };

const Contexto = createContext<ContextoDoEsqueleto>({ cor: corDoEsqueleto("#161c33"), opacidade: OPACIDADE_PARADA });

type PropsDoGrupo = {
  /**
   * O que está carregando, para o leitor de tela ("Carregando ranking"). Sem rótulo, o
   * grupo é só decorativo: serve para um segundo pedaço da mesma tela, para o leitor
   * ouvir "carregando" uma vez só.
   */
  rotulo?: string;
  /** Superfície sobre a qual os blocos ficam (normalmente `palette.surface`). */
  superficie: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Só o pulso e a cor, sem nó próprio nem efeito na acessibilidade. Serve para blocos
 * soltos no meio de conteúdo real (um campo que ainda não chegou numa linha de lista):
 * a lista inteira pulsa com um laço só. Com `ativo` falso, o laço para.
 */
export function EsqueletoPulso({
  superficie,
  ativo = true,
  children,
}: {
  superficie: string;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  const valor = usePulso(superficie, ativo);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function usePulso(superficie: string, ativo: boolean): ContextoDoEsqueleto {
  const reduzido = useMovimentoReduzido();
  const pulso = useRef(new Animated.Value(0)).current;
  const parado = reduzido || !ativo;

  useEffect(() => {
    if (parado) {
      pulso.stopAnimation();
      return;
    }
    const meio = PULSO_MS / 2;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: meio, easing: Easing.inOut(Easing.ease), useNativeDriver: USAR_DRIVER_NATIVO }),
        Animated.timing(pulso, { toValue: 0, duration: meio, easing: Easing.inOut(Easing.ease), useNativeDriver: USAR_DRIVER_NATIVO }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [pulso, parado]);

  return useMemo<ContextoDoEsqueleto>(
    () => ({
      cor: corDoEsqueleto(superficie),
      opacidade: reduzido
        ? OPACIDADE_PARADA
        : (pulso.interpolate({ inputRange: [0, 1], outputRange: [...OPACIDADE_DO_PULSO] }) as unknown as Animated.Value),
    }),
    [superficie, reduzido, pulso],
  );
}

export function EsqueletoGrupo({ rotulo, superficie, children, style, testID }: PropsDoGrupo) {
  const valor = usePulso(superficie, true);

  // O estilo fica sempre no nó que contém os blocos. No nó de fora, uma grade (`row` +
  // `wrap`) ou um `gap` valeriam para um filho só, e a Biblioteca desmontava numa coluna.
  const blocos = (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={style}>
      <Contexto.Provider value={valor}>{children}</Contexto.Provider>
    </View>
  );
  if (!rotulo) return blocos;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rotulo}
      accessibilityState={{ busy: true }}
    >
      {blocos}
    </View>
  );
}

type PropsDoBloco = {
  largura?: DimensionValue;
  altura?: number;
  raio?: number;
  style?: StyleProp<ViewStyle>;
};

/** Um retângulo arredondado. É a peça de que todo o resto é feito. */
export function EsqueletoBloco({ largura = "100%", altura = 14, raio = 6, style }: PropsDoBloco) {
  const { cor, opacidade } = useContext(Contexto);
  return (
    <Animated.View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[{ width: largura, height: altura, borderRadius: raio, backgroundColor: cor, opacity: opacidade }, style]}
    />
  );
}

/** Avatar, ícone ou medalha. */
export function EsqueletoCirculo({ tamanho = 40, style }: { tamanho?: number; style?: StyleProp<ViewStyle> }) {
  return <EsqueletoBloco largura={tamanho} altura={tamanho} raio={tamanho / 2} style={style} />;
}

/** Um parágrafo: `linhas` linhas com larguras variadas, a última mais curta. */
export function EsqueletoTexto({
  linhas = 2,
  altura = 12,
  espaco = 8,
  centralizar = false,
}: {
  linhas?: number;
  altura?: number;
  espaco?: number;
  /** Para texto centralizado (nomes em grade, títulos de cartão). */
  centralizar?: boolean;
}) {
  return (
    <View style={{ gap: espaco, alignItems: centralizar ? "center" : "stretch" }}>
      {Array.from({ length: linhas }, (_, i) => (
        <EsqueletoBloco key={i} largura={larguraDaLinha(i, linhas)} altura={altura} />
      ))}
    </View>
  );
}

/** Linha de lista: círculo à esquerda e duas linhas de texto. */
export function EsqueletoLinha({ comCirculo = true, tamanhoDoCirculo = 40 }: { comCirculo?: boolean; tamanhoDoCirculo?: number }) {
  return (
    <View style={styles.linha}>
      {comCirculo ? <EsqueletoCirculo tamanho={tamanhoDoCirculo} /> : null}
      <View style={styles.linhaTexto}>
        <EsqueletoBloco largura="62%" altura={14} />
        <EsqueletoBloco largura="38%" altura={11} />
      </View>
    </View>
  );
}

/** Repete `quantos` filhos com o mesmo espaçamento: listas e grades falsas. */
export function EsqueletoRepetir({
  quantos,
  espaco = 12,
  children,
}: {
  quantos: number;
  espaco?: number;
  children: (indice: number) => React.ReactNode;
}) {
  return <View style={{ gap: espaco }}>{Array.from({ length: quantos }, (_, i) => <React.Fragment key={i}>{children(i)}</React.Fragment>)}</View>;
}

const styles = StyleSheet.create({
  linha: { flexDirection: "row", alignItems: "center", gap: 12 },
  linhaTexto: { flex: 1, gap: 8 },
});
