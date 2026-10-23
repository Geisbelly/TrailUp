import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
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
  const desktop = useDesktopWeb();

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
  // Sem evento visível, o cartão não existe — ver o aviso do componente. Na tela larga o
  // protótipo v4 (06-social) reserva o lugar com um aviso, que não anuncia evento nenhum.
  if (!evento && !erro) {
    if (!desktop) return null;
    return (
      <View style={[s.caixa, s.vazioLargo, { backgroundColor: surfaceColor, borderColor }]}>
        <MaterialCommunityIcons name="trophy-outline" size={22} color={mutedColor} />
        <View style={s.cabecalhoInfo}>
          <Text style={[s.detalheLargo, s.negrito, { color: textColor }]}>Nenhum evento aberto agora.</Text>
          <Text style={[s.detalheLargo, { color: mutedColor }]}>
            Quando seu professor abrir um evento, ele aparece aqui com as missões e as recompensas.
          </Text>
        </View>
      </View>
    );
  }

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

  // Web em tela larga (#508, protótipo v4 06-social): o evento aberto, sem sanfona, com a
  // modalidade, os números em grade e o atalho para as missões na trilha.
  if (desktop) {
    const andamento = fase === "em_andamento";
    const recompensas = [
      e.medalhaParticipacao ? "Medalha de participação" : null,
      e.medalhaDestaque ? "Destaque para o melhor resultado" : null,
      e.moedas > 0 ? `+${e.moedas} moedas` : null,
      e.recompensa,
    ].filter(Boolean);
    return (
      <View style={[s.caixa, s.caixaLarga, { backgroundColor: surfaceColor, borderColor: andamento ? accent : borderColor }]}>
        <View style={s.topoLargo}>
          <View style={[s.chip, { backgroundColor: andamento ? "rgba(98,219,155,0.16)" : "rgba(144,148,157,0.16)" }]}>
            <Text style={[s.chipTexto, { color: andamento ? "#62db9b" : mutedColor }]}>{rotuloDaFase(fase)}</Text>
          </View>
          {janela ? <Text style={[s.detalheLargo, { color: mutedColor }]}>{janela}</Text> : null}
        </View>
        <Text style={[s.tituloLargo, { color: textColor }]}>{e.titulo}</Text>
        {e.descricao ? <Text style={[s.detalheLargo, { color: mutedColor }]}>{e.descricao}</Text> : null}

        <View style={s.modoLargo}>
          <View style={[s.chip, { backgroundColor: `${accent}22` }]}>
            <Text style={[s.chipTexto, { color: accent }]}>{e.modalidadeGuilda ? "Em guilda" : "Individual"}</Text>
          </View>
          {e.modalidadeGuilda ? (
            <Text style={[s.detalhe, { color: mutedColor, flexShrink: 1 }]}>
              A modalidade individual sempre existe. Quem não está em guilda participa sozinho.
            </Text>
          ) : null}
        </View>

        <View style={s.grade}>
          <View style={[s.celula, { borderColor }]}>
            <Text style={[s.celulaRotulo, { color: mutedColor }]}>Missões</Text>
            <Text style={[s.celulaValor, { color: textColor }]}>
              {e.missoes.length === 1 ? "1 missão" : `${e.missoes.length} missões`}
            </Text>
            {e.missoes.slice(0, 3).map((m) => (
              <Text key={m.atividadeId} style={[s.celulaNota, { color: mutedColor }]} numberOfLines={1}>
                • {m.titulo}
              </Text>
            ))}
          </View>
          <View style={[s.celula, { borderColor }]}>
            <Text style={[s.celulaRotulo, { color: mutedColor }]}>Pontos do evento</Text>
            <Text style={[s.celulaValor, { color: textColor }]}>{e.pontos} pts</Text>
            <Text style={[s.celulaNota, { color: mutedColor }]}>Entram no ranking da turma</Text>
          </View>
          <View style={[s.celula, { borderColor }]}>
            <Text style={[s.celulaRotulo, { color: mutedColor }]}>Sua posição</Text>
            <Text style={[s.celulaValor, { color: minha?.posicao ? accent : textColor }]}>
              {minha ? (minha.posicao ? `${minha.posicao}º lugar` : "Não participou") : "—"}
            </Text>
            <Text style={[s.celulaNota, { color: mutedColor }]}>
              {minha
                ? `${minha.pontos} ponto${minha.pontos === 1 ? "" : "s"}${minha.destaque ? " · destaque" : ""}`
                : fase === "encerrado"
                ? "A classificação ainda não foi divulgada."
                : "A classificação sai quando o professor encerrar o evento."}
            </Text>
          </View>
        </View>

        {podio.length ? (
          <View style={s.podioLargo}>
            {podio.map((p) => (
              <Text key={p.alunoId} style={[s.detalheLargo, { color: p.alunoId === meuId ? accent : textColor }]}>
                {p.posicao}º {p.alunoId === meuId ? "você" : "colega"} · {p.pontos} pts{p.destaque ? " · destaque" : ""}
              </Text>
            ))}
          </View>
        ) : null}

        {recompensas.length || (andamento && e.missoes.length) ? (
          <View style={[s.pe, { borderTopColor: borderColor }]}>
            <Text style={[s.detalheLargo, s.flex, { color: mutedColor }]}>{recompensas.join(" · ")}</Text>
            {andamento && e.missoes.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)")}
                style={[s.botaoLargo, { backgroundColor: accent }]}
              >
                <Text style={[s.botaoLargoTexto, { color: "#0b1328" }]}>Continuar missões</Text>
                <MaterialCommunityIcons name="arrow-right" size={14} color="#0b1328" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

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
  caixaLarga: { paddingVertical: 22, paddingHorizontal: 24, gap: 12 },
  vazioLargo: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, paddingHorizontal: 20 },
  topoLargo: { flexDirection: "row", alignItems: "center", gap: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700" },
  tituloLargo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 22 },
  detalheLargo: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 20 },
  negrito: { fontWeight: "700" },
  flex: { flex: 1, minWidth: 0 },
  modoLargo: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  grade: { flexDirection: "row", gap: 12 },
  celula: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  celulaRotulo: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  celulaValor: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  celulaNota: { fontFamily: FontFamily.interMedium, fontSize: 11.5, lineHeight: 16 },
  podioLargo: { gap: 4 },
  pe: { flexDirection: "row", alignItems: "center", gap: 14, borderTopWidth: 1, paddingTop: 14 },
  botaoLargo: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  botaoLargoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
