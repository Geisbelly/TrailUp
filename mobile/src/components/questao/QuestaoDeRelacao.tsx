import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  alternarSelecao,
  itensDaLista,
  ligarPar,
  listasDaAssociacao,
  moverItem,
  respostaCompleta,
  respostaParaOServidor,
  type FormatoDeRelacao,
} from "@/utils/formatosDeQuestao";

/**
 * Os três formatos de relação, numa tela só.
 *
 * O reforço visual aqui **carrega significado**, não é enfeite: em `associacao`
 * o número do par é o que diz ao aluno o que ele ligou a quê (sem ele, duas
 * colunas de texto não mostram vínculo nenhum), e em `ordenacao` a posição é a
 * própria resposta. Cor sozinha não serve — quem não distingue as cores
 * precisa do número, e é por isso que ele aparece nos dois lados do par.
 */

export type PaletaDaQuestao = {
  accent: string;
  accentMuted: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
};

type Props = {
  formato: FormatoDeRelacao;
  alternativas: unknown;
  palette: PaletaDaQuestao;
  bloqueado?: boolean;
  status?: "certo" | "errado" | null;
  onChange: (respostaJson: string | null) => void;
};

const VERDE = "#22c55e";
const VERMELHO = "#ef4444";

function corDeEstado(status: Props["status"], palette: PaletaDaQuestao) {
  if (status === "certo") return VERDE;
  if (status === "errado") return VERMELHO;
  return palette.accent;
}

export function QuestaoDeRelacao({
  formato,
  alternativas,
  palette,
  bloqueado = false,
  status = null,
  onChange,
}: Props) {
  const listas = useMemo(() => listasDaAssociacao(alternativas), [alternativas]);
  const itens = useMemo(() => itensDaLista(alternativas), [alternativas]);

  const [pares, setPares] = useState<Array<[string, string]>>([]);
  const [termoAtivo, setTermoAtivo] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<string[]>(itens);
  const [marcadas, setMarcadas] = useState<string[]>([]);

  // A ordem inicial é a que veio do banco — já embaralhada pela ordem canônica,
  // então ela nunca é a resposta. Reatribuir quando a lista muda evita que a
  // tela fique com os itens da questão anterior.
  const [itensDaVez, setItensDaVez] = useState<string[]>(itens);
  if (itensDaVez !== itens && itens.join("\u0000") !== itensDaVez.join("\u0000")) {
    setItensDaVez(itens);
    setOrdem(itens);
    setMarcadas([]);
    setPares([]);
    setTermoAtivo(null);
  }

  const cor = corDeEstado(status, palette);

  function emitir(
    proximo: string[] | Array<[string, string]>,
    total: number
  ) {
    const completa = respostaCompleta({
      formato,
      totalDeItens: total,
      escolhidos: proximo.length,
    });
    onChange(completa ? respostaParaOServidor(formato, proximo) : null);
  }

  // ------------------------------------------------------------------
  // Ligar termos
  // ------------------------------------------------------------------
  if (formato === "associacao") {
    const indiceDoTermo = (termo: string) =>
      pares.findIndex(([t]) => t === termo);
    const indiceDaDefinicao = (definicao: string) =>
      pares.findIndex(([, d]) => d === definicao);

    function ligar(definicao: string) {
      if (bloqueado || !termoAtivo) return;
      const proximo = ligarPar(pares, termoAtivo, definicao);
      setPares(proximo);
      setTermoAtivo(null);
      emitir(proximo, listas.termos.length);
    }

    return (
      <View style={s.raiz}>
        <Text style={[s.instrucao, { color: palette.textMuted }]}>
          Toque num termo e depois na definição que combina com ele.
        </Text>
        <View style={s.colunas}>
          <View style={s.coluna}>
            {listas.termos.map((termo) => {
              const n = indiceDoTermo(termo);
              const ativo = termoAtivo === termo;
              return (
                <Pressable
                  key={termo}
                  disabled={bloqueado}
                  onPress={() => setTermoAtivo(ativo ? null : termo)}
                  style={[
                    s.cartao,
                    {
                      backgroundColor: ativo ? palette.accentMuted : palette.surface,
                      borderColor: n >= 0 ? cor : ativo ? palette.accent : palette.border,
                      borderWidth: n >= 0 || ativo ? 2 : 1,
                    },
                  ]}
                >
                  {n >= 0 ? (
                    <View style={[s.selo, { backgroundColor: cor }]}>
                      <Text style={s.seloTexto}>{n + 1}</Text>
                    </View>
                  ) : null}
                  <Text style={[s.cartaoTexto, { color: palette.text }]}>{termo}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.coluna}>
            {listas.definicoes.map((definicao) => {
              const n = indiceDaDefinicao(definicao);
              return (
                <Pressable
                  key={definicao}
                  disabled={bloqueado || !termoAtivo}
                  onPress={() => ligar(definicao)}
                  style={[
                    s.cartao,
                    {
                      backgroundColor: palette.surface,
                      borderColor: n >= 0 ? cor : palette.border,
                      borderWidth: n >= 0 ? 2 : 1,
                      opacity: !termoAtivo && n < 0 && !bloqueado ? 0.65 : 1,
                    },
                  ]}
                >
                  {n >= 0 ? (
                    <View style={[s.selo, { backgroundColor: cor }]}>
                      <Text style={s.seloTexto}>{n + 1}</Text>
                    </View>
                  ) : null}
                  <Text style={[s.cartaoTexto, { color: palette.text }]}>{definicao}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={[s.contador, { color: palette.textMuted }]}>
          {pares.length} de {listas.termos.length} ligados
        </Text>
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Ordenar
  // ------------------------------------------------------------------
  if (formato === "ordenacao") {
    function mover(de: number, direcao: -1 | 1) {
      if (bloqueado) return;
      const proximo = moverItem(ordem, de, direcao);
      if (proximo === ordem) return;
      setOrdem(proximo);
      emitir(proximo, proximo.length);
    }

    return (
      <View style={s.raiz}>
        <Text style={[s.instrucao, { color: palette.textMuted }]}>
          Use as setas para colocar na ordem certa.
        </Text>
        {ordem.map((item, i) => (
          <View
            key={item}
            style={[
              s.linha,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={[s.selo, s.seloFixo, { backgroundColor: cor }]}>
              <Text style={s.seloTexto}>{i + 1}</Text>
            </View>
            <Text style={[s.linhaTexto, { color: palette.text }]}>{item}</Text>
            <View style={s.setas}>
              <Pressable
                accessibilityLabel={`Subir ${item}`}
                disabled={bloqueado || i === 0}
                onPress={() => mover(i, -1)}
                style={[s.seta, { borderColor: palette.border, opacity: i === 0 ? 0.3 : 1 }]}
              >
                <Text style={[s.setaTexto, { color: palette.accent }]}>▲</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Descer ${item}`}
                disabled={bloqueado || i === ordem.length - 1}
                onPress={() => mover(i, 1)}
                style={[
                  s.seta,
                  { borderColor: palette.border, opacity: i === ordem.length - 1 ? 0.3 : 1 },
                ]}
              >
                <Text style={[s.setaTexto, { color: palette.accent }]}>▼</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );
  }

  // ------------------------------------------------------------------
  // Marcar todas as certas
  // ------------------------------------------------------------------
  function alternar(opcao: string) {
    if (bloqueado) return;
    const proximo = alternarSelecao(marcadas, opcao);
    setMarcadas(proximo);
    emitir(proximo, itens.length);
  }

  return (
    <View style={s.raiz}>
      <Text style={[s.instrucao, { color: palette.textMuted }]}>
        Marque TODAS as alternativas corretas — pode ser mais de uma.
      </Text>
      {itens.map((item) => {
        const marcado = marcadas.includes(item);
        return (
          <Pressable
            key={item}
            disabled={bloqueado}
            onPress={() => alternar(item)}
            style={[
              s.linha,
              {
                backgroundColor: marcado ? palette.accentMuted : palette.surface,
                borderColor: marcado ? cor : palette.border,
                borderWidth: marcado ? 2 : 1,
              },
            ]}
          >
            {/* Caixa, nao circulo: a forma diz que da para marcar mais de uma,
                e e o unico sinal que sobrevive sem cor. */}
            <View
              style={[
                s.caixa,
                {
                  borderColor: marcado ? cor : palette.border,
                  backgroundColor: marcado ? cor : "transparent",
                },
              ]}
            >
              {marcado ? <Text style={s.caixaMarca}>✓</Text> : null}
            </View>
            <Text style={[s.linhaTexto, { color: palette.text }]}>{item}</Text>
          </Pressable>
        );
      })}
      <Text style={[s.contador, { color: palette.textMuted }]}>
        {marcadas.length} marcada{marcadas.length === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: 8, marginTop: 4 },
  instrucao: { fontSize: 12, marginBottom: 2 },
  colunas: { flexDirection: "row", gap: 8 },
  coluna: { flex: 1, gap: 8 },
  cartao: {
    borderRadius: 10,
    padding: 11,
    minHeight: 58,
    justifyContent: "center",
  },
  cartaoTexto: { fontSize: 13, lineHeight: 18 },
  selo: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  seloFixo: { position: "relative", top: 0, right: 0 },
  seloTexto: { color: "#fff", fontSize: 11, fontWeight: "800" },
  linha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  linhaTexto: { flex: 1, fontSize: 13, lineHeight: 18 },
  setas: { gap: 4 },
  seta: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  setaTexto: { fontSize: 11 },
  caixa: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  caixaMarca: { color: "#fff", fontSize: 12, fontWeight: "900" },
  contador: { fontSize: 11, textAlign: "right" },
});

export default QuestaoDeRelacao;
