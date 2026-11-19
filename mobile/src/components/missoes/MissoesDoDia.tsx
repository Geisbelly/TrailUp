import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EsqueletoBloco, EsqueletoGrupo, EsqueletoRepetir } from "@/components/carregamento/Esqueleto";
import { useUsuario } from "@/context/SessaoContext";
import { useDesafiosResolvidos } from "@/hooks/useDesafiosResolvidos";
import { FontFamily } from "@/styles/GlobalStyle";
import { esperandoPrimeiraCarga } from "@/utils/esqueleto";
import { juntarComDesafios, type DesafioPublico } from "@/services/missoes/desafio.core";
import { comDesafiosResolvidos } from "@/services/missoes/desafiosResolvidos";
import { carregarMissoesDoAluno } from "@/services/missoes/missoesDoDia";
import { rotuloDaOrigem, rotuloDoEscopo, rotuloDoPrazo, type MissaoDoAluno } from "@/services/missoes/missaoModel";
import {
  carregarDesafiosDoAluno,
  chaveDosDesafios,
  rotaDoDestino,
  type ContextoDosDesafios,
} from "@/services/missoes/rastreadorDeMissoes";
import { ICONE_DO_DESAFIO } from "./variantesDoRastreador";

type MissaoDaLista = MissaoDoAluno & { desafio?: DesafioPublico };

type Props = {
  classeId: number;
  perfil?: string | null;
  /**
   * A trilha já carregada (`topicosDoGrafo` sobre `useTrilha()`), o tópico de retomada e
   * `usuario.perfis`: com isso a lista traz os desafios do tópico da vez, com o "Resolver". Sem
   * isso (grafo ainda não carregado, outra turma), a lista é só das missões comuns.
   */
  desafios?: ContextoDosDesafios;
  accent: string;
  /** Texto sobre o accent (o "Resolver"): o fundo da paleta, em texto grande (AAA a partir de 4,5:1). */
  textoSobreAccent: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
};

export function MissoesDoDia({
  classeId,
  perfil,
  desafios,
  accent,
  textoSobreAccent,
  textColor,
  mutedColor,
  surfaceColor,
  borderColor,
}: Props) {
  const [comuns, setComuns] = useState<MissaoDoAluno[]>([]);
  const [doTopico, setDoTopico] = useState<MissaoDaLista[]>([]);
  // O desafio resolvido na tela dele aparece cumprido ao voltar, sem reler a lista
  // (`desafiosResolvidos`): a Social não relê as missões no foco.
  const { usuario } = useUsuario();
  const resolvidos = useDesafiosResolvidos(usuario?.id);
  const missoes = useMemo(
    () => comDesafiosResolvidos(juntarComDesafios<MissaoDaLista>(comuns, doTopico), resolvidos),
    [comuns, doTopico, resolvidos],
  );
  const pedidoDosDesafios = useRef(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Turma e perfil das missões que estão na tela: atualizar a mesma lista não a apaga.
  const chave = `${classeId}:${perfil ?? ""}`;
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null);

  // A Social monta o contexto de novo a cada render: a lista só relê quando muda o que a leitura
  // dos desafios usa (os tópicos da vez e os perfis representativos).
  const chaveDesafios = desafios ? chaveDosDesafios(desafios) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave é a identidade do contexto
  const contexto = useMemo(() => desafios, [chaveDesafios]);

  const load = useCallback(async () => {
    if (!classeId) return;
    setLoading(true);
    setErro(null);
    try {
      setComuns(await carregarMissoesDoAluno(classeId, perfil));
      setChaveCarregada(`${classeId}:${perfil ?? ""}`);
    } catch (e) {
      setErro("Não foi possível carregar suas missões.");
      console.warn("[MissoesDoDia]", e);
    } finally {
      setLoading(false);
    }
  }, [classeId, perfil]);

  // Os desafios em leitura própria: o grafo ou o tópico de retomada chegam depois da lista, e isso
  // relê só os desafios, não as missões comuns. `carregarDesafiosDoAluno` nunca lança.
  const carregarDesafios = useCallback(async () => {
    const meu = ++pedidoDosDesafios.current;
    const lista = classeId && contexto ? await carregarDesafiosDoAluno(classeId, contexto) : [];
    if (meu === pedidoDosDesafios.current) setDoTopico(lista);
  }, [classeId, contexto]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void carregarDesafios();
  }, [carregarDesafios]);

  if (!classeId) return null;

  const primeiraCarga = esperandoPrimeiraCarga(loading, missoes.length, chave, chaveCarregada);

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]} accessibilityLabel="Minhas missões">
      <View style={s.header}>
        <MaterialCommunityIcons name="flag-checkered" size={20} color={accent} />
        <Text style={[s.title, { color: textColor }]}>Minhas missões</Text>
        <Pressable
          accessibilityLabel="Atualizar minhas missões"
          onPress={() => {
            void load();
            void carregarDesafios();
          }}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="refresh" size={18} color={mutedColor} />
        </Pressable>
      </View>

      {primeiraCarga ? (
        <EsqueletoGrupo rotulo="Carregando suas missões" superficie={surfaceColor}>
          <EsqueletoRepetir quantos={2} espaco={10}>
            {(i) => (
              <View style={[s.item, s.itemEsqueleto, { borderColor }]}>
                <View style={[s.itemTop, s.itemTopEsqueleto]}>
                  <EsqueletoBloco largura={i === 0 ? "62%" : "48%"} altura={14} />
                  <EsqueletoBloco largura={20} altura={20} raio={10} />
                </View>
                <EsqueletoBloco largura="40%" altura={10} />
              </View>
            )}
          </EsqueletoRepetir>
        </EsqueletoGrupo>
      ) : null}

      {!loading && erro ? (
        <Text style={[s.erro, { color: mutedColor }]}>{erro}</Text>
      ) : null}

      {!loading && !erro && missoes.length === 0 ? (
        <Text style={[s.vazio, { color: mutedColor }]}>
          Ainda não há missão para você. As do dia aparecem depois da meia-noite.
        </Text>
      ) : null}

      {!primeiraCarga &&
        missoes.map((m) => {
          const done = m.status === "concluida";
          const aberta = m.status === "pendente" || m.status === "em_andamento";
          return (
            <View key={m.id} style={[s.item, { borderColor }]}>
              <View style={s.itemTop}>
                {m.desafio ? (
                  <MaterialCommunityIcons name={ICONE_DO_DESAFIO[m.desafio.tipo]} size={18} color={accent} />
                ) : null}
                <Text style={[s.itemTitle, { color: textColor }]} numberOfLines={2}>
                  {m.titulo}
                </Text>
                <MaterialCommunityIcons
                  name={done ? "check-circle" : "circle-outline"}
                  size={20}
                  color={done ? accent : mutedColor}
                />
              </View>
              {m.descricao ? (
                <Text style={[s.itemDesc, { color: mutedColor }]} numberOfLines={3}>
                  {m.descricao}
                </Text>
              ) : null}
              <Text style={[s.meta, { color: mutedColor }]}>
                {[
                  rotuloDaOrigem(m.origem),
                  rotuloDoEscopo(m.escopo),
                  m.criterioRotulo,
                  // Só a do professor e a sugerida têm prazo que o aluno precisa ver; a do dia vence à
                  // meia-noite e dizer "até hoje" nela seria ruído.
                  m.origem !== "sistema" ? rotuloDoPrazo(m.prazo) : "",
                  done ? "cumprida" : m.progresso > 0 ? `${m.progresso}%` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {m.desafio && aberta ? (
                <Pressable
                  onPress={() => {
                    const rota = rotaDoDestino({ tipo: "desafio", missaoId: m.id });
                    if (rota) router.push(rota);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Resolver ${m.titulo}`}
                  style={({ pressed }) => [s.resolver, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[s.resolverTexto, { color: textoSobreAccent }]}>Resolver</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 15 },
  erro: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  vazio: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  item: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  itemEsqueleto: { gap: 8 },
  itemTopEsqueleto: { justifyContent: "space-between" },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { flex: 1, fontFamily: FontFamily.poppinsExtraBold, fontSize: 13 },
  itemDesc: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  meta: { fontFamily: FontFamily.interMedium, fontSize: 11, marginTop: 2 },
  resolver: { alignSelf: "flex-end", minHeight: 44, minWidth: 96, borderRadius: 999, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  // Texto grande (≥ 19px em negrito): o fundo da paleta sobre o accent mede 6,0 a 8,8:1, que é AAA
  // só para texto grande. Em 14px seria AA.
  resolverTexto: { fontFamily: FontFamily.interMedium, fontSize: 19, fontWeight: "700" },
});
