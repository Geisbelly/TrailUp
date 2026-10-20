import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FontFamily } from "@/styles/GlobalStyle";
import { alunoAtual } from "@/services/social/guildService";
import { carregarEventosDaTurma } from "@/services/eventos/eventosDaTurma";
import {
  eventoEmDestaque,
  faseDoEvento,
  minhaPosicao,
  podioDoEvento,
  rotuloDaFase,
  type EventoDaTurma as Evento,
} from "@/services/eventos/eventoModel";

type Props = {
  classeId: number;
  accent: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
};

function dataCurta(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * O evento da turma, na tela do aluno.
 *
 * Antes desta tela o aluno **não via evento nenhum**: o professor abria, definia missões,
 * acompanhava e encerrava, e `eventos_classe` não era lido em nenhum lugar do mobile. A policy
 * de leitura dele já existia desde `20260826_09`.
 *
 * O cartão não aparece quando não há evento visível — e "não há" inclui o evento em rascunho,
 * que a RLS esconde. Mostrar uma caixa vazia anunciaria algo que o aluno não pode ver.
 */
export function EventoDaTurma({ classeId, accent, textColor, mutedColor, surfaceColor, borderColor }: Props) {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!classeId) return;
    setCarregando(true);
    setErro(null);
    try {
      const [eventos, id] = await Promise.all([carregarEventosDaTurma(classeId), alunoAtual()]);
      setMeuId(id);
      setEvento(eventoEmDestaque(eventos));
    } catch (e) {
      console.warn("[Evento] Falha ao carregar:", e);
      setErro("Não foi possível carregar o evento da turma.");
    } finally {
      setCarregando(false);
    }
  }, [classeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <ActivityIndicator color={accent} style={s.loader} />;
  // Sem evento visível, o cartão não existe — ver o aviso do componente.
  if (!evento && !erro) return null;

  if (erro) {
    return (
      <View style={[s.caixa, { backgroundColor: surfaceColor, borderColor }]}>
        <Text style={[s.erro, { color: mutedColor }]}>{erro}</Text>
        <Pressable onPress={() => void carregar()}>
          <Text style={[s.link, { color: accent }]}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  const e = evento!;
  const fase = faseDoEvento(e);
  const minha = minhaPosicao(e, meuId);
  const podio = podioDoEvento(e);
  const janela = [dataCurta(e.inicio), dataCurta(e.fim)].filter(Boolean).join(" a ");

  return (
    <View style={[s.caixa, { backgroundColor: surfaceColor, borderColor }]}>
      <Pressable style={s.cabecalho} onPress={() => setAberto((v) => !v)}>
        <MaterialCommunityIcons name="trophy-outline" size={20} color={accent} />
        <View style={s.cabecalhoInfo}>
          <Text style={[s.titulo, { color: textColor }]} numberOfLines={1}>{e.titulo}</Text>
          <Text style={[s.fase, { color: fase === "em_andamento" ? accent : mutedColor }]}>
            {rotuloDaFase(fase)}
            {janela ? ` · ${janela}` : ""}
            {e.modalidadeGuilda ? " · por guilda" : ""}
          </Text>
        </View>
        <MaterialCommunityIcons name={aberto ? "chevron-up" : "chevron-down"} size={20} color={mutedColor} />
      </Pressable>

      {minha ? (
        <View style={[s.minha, { borderColor }]}>
          <Text style={[s.minhaPos, { color: accent }]}>
            {minha.posicao ? `${minha.posicao}º lugar` : "Você não participou"}
          </Text>
          <Text style={[s.detalhe, { color: mutedColor }]}>
            {minha.pontos} ponto{minha.pontos === 1 ? "" : "s"}
            {minha.destaque ? " · destaque" : ""}
          </Text>
        </View>
      ) : null}

      {aberto ? (
        <View style={s.corpo}>
          {e.descricao ? <Text style={[s.detalhe, { color: mutedColor }]}>{e.descricao}</Text> : null}

          {e.pontos > 0 || e.moedas > 0 || e.medalhaParticipacao || e.medalhaDestaque ? (
            <Text style={[s.detalhe, { color: mutedColor }]}>
              {[
                e.pontos > 0 ? `${e.pontos} pontos` : null,
                e.moedas > 0 ? `${e.moedas} moedas` : null,
                e.medalhaParticipacao ? "medalha de participação" : null,
                e.medalhaDestaque ? "medalha de destaque" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}

          {e.missoes.length ? (
            <View style={s.lista}>
              <Text style={[s.rotulo, { color: mutedColor }]}>MISSÕES DO EVENTO</Text>
              {e.missoes.map((m) => (
                <View key={m.atividadeId} style={s.item}>
                  <MaterialCommunityIcons name="flag-outline" size={14} color={accent} />
                  <Text style={[s.detalhe, { color: textColor, flexShrink: 1 }]} numberOfLines={2}>{m.titulo}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {podio.length ? (
            <View style={s.lista}>
              <Text style={[s.rotulo, { color: mutedColor }]}>CLASSIFICAÇÃO</Text>
              {podio.map((p) => (
                <View key={p.alunoId} style={s.item}>
                  <Text style={[s.pos, { color: p.alunoId === meuId ? accent : mutedColor }]}>{p.posicao}º</Text>
                  <Text style={[s.detalhe, { color: p.alunoId === meuId ? accent : textColor, flexShrink: 1 }]}>
                    {p.alunoId === meuId ? "você" : "colega"} · {p.pontos} pts
                    {p.destaque ? " · destaque" : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : fase === "encerrado" ? (
            <Text style={[s.detalhe, { color: mutedColor }]}>A classificação ainda não foi divulgada.</Text>
          ) : (
            // Resultado só existe em evento encerrado, por policy — não é falha de carregamento.
            <Text style={[s.detalhe, { color: mutedColor }]}>
              A classificação sai quando o professor encerrar o evento.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  loader: { marginVertical: 16 },
  caixa: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 10 },
  cabecalhoInfo: { flex: 1, gap: 2 },
  titulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 14 },
  fase: { fontFamily: FontFamily.interMedium, fontSize: 11 },
  minha: { borderTopWidth: 1, paddingTop: 10, gap: 2 },
  minhaPos: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
  corpo: { gap: 10 },
  detalhe: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  lista: { gap: 6 },
  rotulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 9, letterSpacing: 0.5 },
  item: { flexDirection: "row", alignItems: "center", gap: 7 },
  pos: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12, width: 26 },
  erro: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  link: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 },
});
