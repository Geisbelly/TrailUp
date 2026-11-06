import { textoDeErro } from "@/utils/textoDeErro";
import { avisoDaDoacao, opcoesDeDoacao, progressoDoFundo, textoDoProgresso } from "@/services/loja/fundoTurmaModel";
import { carregarFundoDaTurma, doarAoFundo, type FundoComMinhaDoacao } from "@/services/loja/fundoTurmaService";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  alunoId: string;
  classeId: number;
  saldo: number | null;
  palette: ReturnType<typeof getProfileShellPalette>;
  /** Depois de doar: o saldo da loja mudou. */
  onDoou: () => void;
};

/**
 * Fundo da turma (#144): a recompensa coletiva. Sem fundo ativo, o cartão não aparece. Tocar num valor
 * pede confirmação antes de gastar (um toque não pode gastar moedas, a mesma regra da compra).
 */
export function FundoDaTurmaCard({ alunoId, classeId, saldo, palette, onDoou }: Props) {
  const [dados, setDados] = useState<FundoComMinhaDoacao | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await carregarFundoDaTurma(classeId, alunoId));
    } catch {
      setDados(null); // sem fundo legível (ou migration ausente): o cartão some, a loja segue
    }
  }, [alunoId, classeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!dados) return null;
  const { fundo, minhaDoacao } = dados;
  const opcoes = opcoesDeDoacao(fundo, saldo);
  const pct = progressoDoFundo(fundo);

  const doar = async () => {
    if (escolhido === null || trava.current) return;
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const r = await doarAoFundo(fundo.id, escolhido);
      setAviso(avisoDaDoacao(r));
      setEscolhido(null);
      onDoou();
      await carregar();
    } catch (e) {
      setErro(textoDeErro(e, "Não foi possível registrar a doação."));
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  };

  return (
    <View style={[s.card, { borderColor: palette.accentSoft, backgroundColor: palette.surface }]}>
      <Text style={[s.rotulo, { color: palette.accent }]}>FUNDO DA TURMA</Text>
      <Text style={[s.titulo, { color: palette.text }]}>{fundo.titulo}</Text>
      <Text style={[s.texto, { color: palette.textMuted }]}>
        Se a turma juntar {fundo.meta} moedas: {fundo.beneficio}
      </Text>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Progresso do fundo da turma"
        accessibilityValue={{ min: 0, max: 100, now: pct, text: textoDoProgresso(fundo) }}
        style={[s.barra, { backgroundColor: palette.accentSoft }]}
      >
        <View style={[s.preenchido, { width: `${pct}%`, backgroundColor: palette.accent }]} />
      </View>
      <Text style={[s.progresso, { color: palette.text }]}>{textoDoProgresso(fundo)}</Text>
      {minhaDoacao > 0 ? (
        <Text style={[s.texto, { color: palette.textMuted }]}>Você já doou {minhaDoacao} moedas.</Text>
      ) : null}

      {fundo.status === "atingido" ? (
        <Text style={[s.destaque, { color: palette.text }]}>Meta atingida! O professor vai entregar o benefício.</Text>
      ) : opcoes.length === 0 ? (
        <Text style={[s.texto, { color: palette.textMuted }]}>Ganhe moedas estudando para poder doar.</Text>
      ) : (
        <>
          <View style={s.opcoes} accessibilityRole="radiogroup" accessibilityLabel="Quanto doar">
            {opcoes.map((v) => (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhido === v }}
                onPress={() => setEscolhido(escolhido === v ? null : v)}
                style={[
                  s.opcao,
                  { borderColor: palette.accent },
                  escolhido === v && { backgroundColor: palette.accentSoft },
                ]}
              >
                <Text style={[s.opcaoTexto, { color: palette.text }]}>{v} moedas</Text>
              </Pressable>
            ))}
          </View>
          {escolhido !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirmar doação de ${escolhido} moedas`}
              disabled={enviando}
              onPress={() => void doar()}
              style={[s.confirmar, { backgroundColor: palette.accent, opacity: enviando ? 0.6 : 1 }]}
            >
              {enviando ? (
                <ActivityIndicator color={palette.surface} />
              ) : (
                <Text style={[s.confirmarTexto, { color: palette.surface }]}>
                  Doar {escolhido} moedas{saldo !== null ? ` (saldo: ${saldo} → ${saldo - escolhido})` : ""}
                </Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}

      {aviso ? (
        <Text accessibilityLiveRegion="polite" style={[s.texto, { color: palette.text }]}>
          {aviso}
        </Text>
      ) : null}
      {erro ? (
        <Text accessibilityRole="alert" style={[s.texto, { color: palette.text }]}>
          {erro}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  destaque: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  barra: { height: 10, borderRadius: 5, overflow: "hidden", marginTop: 4 },
  preenchido: { height: 10, borderRadius: 5 },
  progresso: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  opcoes: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  opcao: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  opcaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  confirmar: { borderRadius: 999, paddingVertical: 12, alignItems: "center", minHeight: 44, justifyContent: "center" },
  confirmarTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
