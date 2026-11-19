import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import {
  casasDaGrade,
  celulaAnterior,
  celulasDaPalavra,
  chaveDaCelula,
  letraDigitada,
  palavraDaCelula,
  proximaCelula,
  rotuloDaCelula,
  type Celula,
  type DesafioCruzadinhaPublico,
  type PalavraNaGrade,
  type Preenchimento,
} from "@/services/missoes/desafio.core";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Props = {
  desafio: DesafioCruzadinhaPublico;
  celulas: Preenchimento;
  onMudar: (celulas: Preenchimento) => void;
  /** Resolvida: a grade e as pistas ficam, sem deixar escrever. */
  somenteLeitura: boolean;
  palette: ProfileShellPalette;
};

type Selecao = { palavra: PalavraNaGrade; linha: number; coluna: number };

const DIRECAO = { h: "horizontal", v: "vertical" } as const;
const mesmaPalavra = (a: PalavraNaGrade | undefined, b: PalavraNaGrade) => !!a && a.numero === b.numero && a.direcao === b.direcao;

/**
 * A cruzadinha: a grade numerada e as pistas.
 *
 * Cada casa é um campo de uma letra, com o rótulo de leitor de tela "linha 2, coluna 3, palavra 4
 * horizontal". O toque escolhe a palavra (`palavraDaCelula`: o segundo toque na mesma casa troca
 * de direção), digitar anda para a próxima casa vazia (`proximaCelula`) e apagar numa casa vazia
 * volta uma (`celulaAnterior`). Tocar numa pista escolhe a palavra dela.
 *
 * A grade não tem a resposta: quem confere é o banco.
 */
export function Cruzadinha({ desafio, celulas, onMudar, somenteLeitura, palette }: Props) {
  const casas = useMemo(() => casasDaGrade(desafio), [desafio]);
  const { width } = useWindowDimensions();
  // A grade tenta caber na largura (16 px de margem de cada lado, 2 px entre casas), entre 28 e 44
  // px por casa. Grade larga demais (até 15 colunas) rola de lado em vez de encolher a casa.
  const lado = Math.max(28, Math.min(44, Math.floor((Math.min(width, 560) - 32) / desafio.colunas) - 2));

  const [selecao, setSelecao] = useState<Selecao | null>(null);
  // Os toques e o foco chegam em eventos seguidos, antes do novo render: a seleção vale pela ref.
  const selecaoRef = useRef<Selecao | null>(null);
  const celulasRef = useRef(celulas);
  celulasRef.current = celulas;
  const campos = useRef(new Map<string, TextInput | null>());

  const selecionar = useCallback((s: Selecao | null) => {
    selecaoRef.current = s;
    setSelecao(s);
  }, []);

  const irPara = useCallback(
    (palavra: PalavraNaGrade, c: Celula) => {
      selecionar({ palavra, linha: c.linha, coluna: c.coluna });
      campos.current.get(chaveDaCelula(c.linha, c.coluna))?.focus();
    },
    [selecionar],
  );

  /** Toque na casa: pode trocar de direção (segundo toque na casa do cursor). */
  const tocar = (linha: number, coluna: number) => {
    const palavra = palavraDaCelula(desafio, linha, coluna, selecaoRef.current);
    if (palavra) selecionar({ palavra, linha, coluna });
  };

  /** Foco que não veio de toque nem do cursor (teclado, leitor de tela): só segue a casa. */
  const focar = (linha: number, coluna: number) => {
    const atual = selecaoRef.current;
    if (atual && atual.linha === linha && atual.coluna === coluna) return;
    const palavra = palavraDaCelula(desafio, linha, coluna, atual);
    if (palavra) selecionar({ palavra, linha, coluna });
  };

  const escrever = (linha: number, coluna: number, texto: string) => {
    const chave = chaveDaCelula(linha, coluna);
    const letra = letraDigitada(texto);
    const novo = { ...celulasRef.current, [chave]: letra };
    if (!letra) delete novo[chave];
    celulasRef.current = novo;
    onMudar(novo);
    const palavra = selecaoRef.current?.palavra ?? palavraDaCelula(desafio, linha, coluna, null);
    if (letra && palavra) irPara(palavra, proximaCelula(palavra, novo, { linha, coluna }));
  };

  /** Apagar numa casa vazia volta uma e apaga a de trás. Na casa com letra, quem apaga é o campo. */
  const apagar = (linha: number, coluna: number) => {
    const palavra = selecaoRef.current?.palavra;
    if (!palavra || celulasRef.current[chaveDaCelula(linha, coluna)]) return;
    const anterior = celulaAnterior(palavra, { linha, coluna });
    if (anterior.linha === linha && anterior.coluna === coluna) return;
    const { [chaveDaCelula(anterior.linha, anterior.coluna)]: _apagada, ...resto } = celulasRef.current;
    celulasRef.current = resto;
    onMudar(resto);
    irPara(palavra, anterior);
  };

  /** Pista tocada: a palavra dela, na primeira casa vazia (ou na primeira). */
  const escolherPista = (palavra: PalavraNaGrade) => {
    const casasDaPalavra = celulasDaPalavra(palavra);
    const vazia = casasDaPalavra.find((c) => !celulasRef.current[chaveDaCelula(c.linha, c.coluna)]);
    irPara(palavra, vazia ?? casasDaPalavra[0]);
  };

  const pistas = (direcao: "h" | "v") =>
    desafio.palavras.filter((p) => p.direcao === direcao).sort((a, b) => a.numero - b.numero);

  return (
    <View style={s.raiz}>
      {selecao && !somenteLeitura ? (
        <Text style={[s.pistaAtual, { color: palette.text }]} accessibilityLiveRegion="polite">
          {selecao.palavra.numero} {DIRECAO[selecao.palavra.direcao]} · {selecao.palavra.pista}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.rolagem}
      >
        {/* A rolagem de lado põe os filhos em linha: as fileiras vão numa coluna. */}
        <View>
          {Array.from({ length: desafio.linhas }, (_, linha) => (
            <View key={linha} style={s.fileira}>
              {Array.from({ length: desafio.colunas }, (_, coluna) => {
                const chave = chaveDaCelula(linha, coluna);
                const casa = casas.get(chave);
                if (!casa) return <View key={chave} style={[s.vazia, { width: lado, height: lado }]} />;
                const naPalavra = !!selecao && casa.palavras.some((p) => mesmaPalavra(selecao.palavra, p));
                const noCursor = !!selecao && selecao.linha === linha && selecao.coluna === coluna;
                return (
                  <View
                    key={chave}
                    style={[
                      s.casa,
                      {
                        width: lado,
                        height: lado,
                        borderColor: noCursor ? palette.accent : palette.borderStrong,
                        borderWidth: noCursor ? 2 : 1,
                        backgroundColor: naPalavra ? palette.accentMuted : palette.surfaceElevated,
                      },
                    ]}
                  >
                    {casa.numero !== null ? (
                      <Text style={[s.numero, { color: palette.textMuted }]} importantForAccessibility="no" accessibilityElementsHidden>
                        {casa.numero}
                      </Text>
                    ) : null}
                    <TextInput
                      ref={(campo) => {
                        campos.current.set(chave, campo);
                      }}
                      value={celulas[chave] ?? ""}
                      onChangeText={(texto) => escrever(linha, coluna, texto)}
                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === "Backspace") apagar(linha, coluna);
                      }}
                      onPressIn={() => tocar(linha, coluna)}
                      onFocus={() => focar(linha, coluna)}
                      editable={!somenteLeitura}
                      accessibilityLabel={rotuloDaCelula(desafio, linha, coluna)}
                      accessibilityState={{ selected: noCursor, disabled: somenteLeitura }}
                      selectTextOnFocus
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      spellCheck={false}
                      contextMenuHidden
                      caretHidden
                      style={[s.letra, { color: palette.text, fontSize: Math.round(lado * 0.5) }]}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {(["h", "v"] as const).map((direcao) => (
        <View key={direcao} style={s.secao}>
          <Text style={[s.secaoTitulo, { color: palette.textMuted }]} accessibilityRole="header">
            {direcao === "h" ? "Horizontais" : "Verticais"}
          </Text>
          <View accessibilityRole="list" style={s.lista}>
            {pistas(direcao).map((p) => {
              const ativa = mesmaPalavra(selecao?.palavra, p);
              return (
                <Pressable
                  key={`${p.numero}${p.direcao}`}
                  onPress={() => escolherPista(p)}
                  disabled={somenteLeitura}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativa, disabled: somenteLeitura }}
                  accessibilityLabel={`Palavra ${p.numero} ${DIRECAO[p.direcao]}, ${p.tamanho} letras: ${p.pista}`}
                  style={[s.pista, ativa && { backgroundColor: palette.accentMuted }]}
                >
                  <Text style={[s.pistaNumero, { color: palette.accent }]}>{p.numero}</Text>
                  <Text style={[s.pistaTexto, { color: palette.text }]}>
                    {p.pista} <Text style={{ color: palette.textMuted }}>({p.tamanho})</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: 16 },
  pistaAtual: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  rolagem: { flexGrow: 1, justifyContent: "center" },
  fileira: { flexDirection: "row" },
  casa: { margin: 1, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  vazia: { margin: 1 },
  numero: { position: "absolute", top: 1, left: 3, fontSize: 9, fontFamily: FontFamily.interMedium },
  letra: { width: "100%", height: "100%", padding: 0, textAlign: "center", fontFamily: FontFamily.interMedium, fontWeight: "700" },
  secao: { gap: 6 },
  secaoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  lista: { gap: 2 },
  pista: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, borderRadius: 8 },
  pistaNumero: { minWidth: 18, fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  pistaTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 20 },
});
