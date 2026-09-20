import { ArenaRoundModal } from "@/components/social/ArenaRoundModal";
import {
  ADVERSARIOS_POR_FORMATO,
  ARENA_FORMATOS,
  ARENA_MODOS,
  EXPLICACAO_DO_FORMATO,
  EXPLICACAO_DO_MODO,
  ROTULO_DO_FORMATO,
  ROTULO_DO_MODO,
  faltaParaCriar,
  formatarTempo,
  integrantesDaEquipe,
  ordenarDesafios,
  placarDaEquipe,
  situacaoDoDesafio,
  type ArenaDesafio,
  type ArenaFormato,
  type ArenaModo,
  type ArenaSituacao,
} from "@/services/social/arenaModel";
import { criarDesafio, mensagemDeErroDaArena, responderConvite } from "@/services/social/arenaService";
import type { Guild } from "@/services/social/guildModel";
import type { SocialPerson } from "@/services/social/socialModel";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  desafios: ArenaDesafio[];
  pessoas: SocialPerson[];
  guildas: Guild[];
  classeId: number;
  accent: string;
  onReload: () => Promise<void>;
};

const QUANTIDADES = [3, 5, 10] as const;

const SELO: Record<ArenaSituacao, { texto: string; cor: string; icone: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  convite: { texto: "CONVITE", cor: "#9db8ff", icone: "email-outline" },
  jogando: { texto: "SUA VEZ", cor: "#fbbf24", icone: "sword-cross" },
  aguardando: { texto: "AGUARDANDO", cor: "#8f8da3", icone: "timer-sand" },
  venci: { texto: "VITÓRIA", cor: "#4ade80", icone: "trophy" },
  empate: { texto: "EMPATE", cor: "#9db8ff", icone: "equal" },
  perdi: { texto: "DERROTA", cor: "#f87171", icone: "shield-off-outline" },
  recusado: { texto: "RECUSADO", cor: "#6b6a7d", icone: "close-circle-outline" },
};

function nomeCurto(pessoa: SocialPerson) {
  return pessoa.apelido || pessoa.nome;
}

export function ArenaSection({ desafios, pessoas, guildas, classeId, accent, onReload }: Props) {
  const [criando, setCriando] = useState(false);
  const [formato, setFormato] = useState<ArenaFormato>("solo");
  const [modo, setModo] = useState<ArenaModo>("precisao");
  const [quantidade, setQuantidade] = useState<number>(3);
  const [aliadoId, setAliadoId] = useState<string | null>(null);
  const [adversarios, setAdversarios] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodadaAberta, setRodadaAberta] = useState<string | null>(null);

  // Guilda minha nesta turma. O formato `guilda` so existe se houver uma --
  // e a mesma condicao que `arena_desafio_criar` verifica.
  const minhaGuilda = useMemo(() => guildas.find((g) => g.souMembro) ?? null, [guildas]);

  // Quem pode ser convocado: colega da turma que nao esta bloqueado. O banco
  // confere de novo; aqui e so para nao oferecer o impossivel.
  const convocaveis = useMemo(
    () => pessoas.filter((p) => p.status !== "blocked").filter((p, i, todos) => todos.findIndex((o) => o.alunoId === p.alunoId) === i),
    [pessoas],
  );

  const ordenados = useMemo(() => ordenarDesafios(desafios), [desafios]);
  const impedimento = faltaParaCriar({ formato, guildaId: minhaGuilda?.id ?? null, aliadoId, adversarios });

  async function agir(chave: string, operacao: () => Promise<unknown>) {
    setOcupado(chave);
    setErro(null);
    try {
      await operacao();
      await onReload();
    } catch (caught) {
      console.warn("[Arena] Falha na ação:", caught);
      setErro(mensagemDeErroDaArena(caught));
    } finally {
      setOcupado(null);
    }
  }

  function trocarFormato(novo: ArenaFormato) {
    setFormato(novo);
    // Quem foi escolhido para um formato nao serve para outro: dupla pede dois
    // adversarios, solo pede um, guilda nao pede nenhum. Manter a selecao velha
    // deixava o botao habilitado com gente a mais, e o erro so aparecia no
    // servidor.
    setAliadoId(null);
    setAdversarios([]);
  }

  function alternarAdversario(alunoId: string) {
    const limite = ADVERSARIOS_POR_FORMATO[formato];
    setAdversarios((atual) => {
      if (atual.includes(alunoId)) return atual.filter((id) => id !== alunoId);
      if (atual.length >= limite) return [...atual.slice(1), alunoId];
      return [...atual, alunoId];
    });
    if (aliadoId === alunoId) setAliadoId(null);
  }

  function escolherAliado(alunoId: string) {
    setAliadoId((atual) => (atual === alunoId ? null : alunoId));
    setAdversarios((atual) => atual.filter((id) => id !== alunoId));
  }

  async function criar() {
    await agir("criar", async () => {
      await criarDesafio({
        classeId,
        formato,
        modo,
        quantidade,
        guildaId: formato === "guilda" ? minhaGuilda?.id ?? null : null,
        aliadoId: formato === "dupla" ? aliadoId : null,
        adversarios,
      });
      setCriando(false);
      setAliadoId(null);
      setAdversarios([]);
    });
  }

  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View style={s.headingTexto}>
          <Text style={[s.title, { color: accent }]}>ARENA</Text>
          <Text style={s.subtitle}>Guilda, dupla ou solo — e o resultado vai para o ranking.</Text>
        </View>
        <MaterialCommunityIcons name="sword-cross" size={34} color={accent} />
      </View>

      {erro ? <Text style={s.erro}>{erro}</Text> : null}

      {!criando ? (
        <Pressable onPress={() => setCriando(true)} style={[s.primary, { backgroundColor: accent }]}>
          <Text style={s.primaryText}>Novo desafio</Text>
        </Pressable>
      ) : (
        <View style={s.form}>
          <Text style={s.formTitulo}>QUEM JOGA</Text>
          <View style={s.chips}>
            {ARENA_FORMATOS.map((opcao) => {
              const ativo = formato === opcao;
              const indisponivel = opcao === "guilda" && !minhaGuilda;
              return (
                <Pressable
                  key={opcao}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo, disabled: indisponivel }}
                  disabled={indisponivel}
                  onPress={() => trocarFormato(opcao)}
                  style={[s.chip, ativo && { backgroundColor: accent, borderColor: accent }, indisponivel && s.chipOff]}
                >
                  <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{ROTULO_DO_FORMATO[opcao]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.explicacao}>
            {formato === "guilda" && !minhaGuilda
              ? "Entre numa guilda da turma para usar este formato."
              : EXPLICACAO_DO_FORMATO[formato]}
          </Text>

          <Text style={s.formTitulo}>COMO SE GANHA</Text>
          <View style={s.chips}>
            {ARENA_MODOS.map((opcao) => {
              const ativo = modo === opcao;
              return (
                <Pressable
                  key={opcao}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => setModo(opcao)}
                  style={[s.chip, ativo && { backgroundColor: accent, borderColor: accent }]}
                >
                  <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{ROTULO_DO_MODO[opcao]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.explicacao}>{EXPLICACAO_DO_MODO[modo]}</Text>

          <Text style={s.formTitulo}>QUANTAS QUESTÕES</Text>
          <View style={s.chips}>
            {QUANTIDADES.map((n) => {
              const ativo = quantidade === n;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => setQuantidade(n)}
                  style={[s.chip, ativo && { backgroundColor: accent, borderColor: accent }]}
                >
                  <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>

          {formato === "guilda" ? (
            <Text style={s.explicacao}>
              {minhaGuilda ? `Sua guilda: ${minhaGuilda.nome} (${minhaGuilda.membrosAtivos} membros).` : ""}
            </Text>
          ) : (
            <>
              {formato === "dupla" ? (
                <>
                  <Text style={s.formTitulo}>SEU ALIADO</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pessoas}>
                    {convocaveis.map((pessoa) => (
                      <Pressable
                        key={`aliado-${pessoa.alunoId}`}
                        onPress={() => escolherAliado(pessoa.alunoId)}
                        style={[s.pessoa, aliadoId === pessoa.alunoId && { borderColor: accent, backgroundColor: "rgba(157,184,255,.14)" }]}
                      >
                        <Text numberOfLines={1} style={s.pessoaNome}>{nomeCurto(pessoa)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}
              <Text style={s.formTitulo}>
                {ADVERSARIOS_POR_FORMATO[formato] === 1 ? "SEU ADVERSÁRIO" : "OS ADVERSÁRIOS"}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pessoas}>
                {convocaveis.map((pessoa) => (
                  <Pressable
                    key={`adv-${pessoa.alunoId}`}
                    onPress={() => alternarAdversario(pessoa.alunoId)}
                    style={[s.pessoa, adversarios.includes(pessoa.alunoId) && { borderColor: accent, backgroundColor: "rgba(248,113,113,.16)" }]}
                  >
                    <Text numberOfLines={1} style={s.pessoaNome}>{nomeCurto(pessoa)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {convocaveis.length === 0 ? (
                <Text style={s.explicacao}>Ninguém da turma disponível ainda.</Text>
              ) : null}
            </>
          )}

          {impedimento ? <Text style={s.impedimento}>{impedimento}</Text> : null}

          <View style={s.formAcoes}>
            <Pressable onPress={() => setCriando(false)} style={s.secondary}>
              <Text style={s.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={impedimento !== null || ocupado === "criar"}
              onPress={() => void criar()}
              style={[s.primary, s.formPrimary, { backgroundColor: accent, opacity: impedimento ? 0.45 : 1 }]}
            >
              {ocupado === "criar" ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Lançar desafio</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {ordenados.length === 0 ? (
        <View style={s.vazio}>
          <MaterialCommunityIcons name="shield-sword-outline" size={42} color={accent} />
          <Text style={s.vazioTexto}>Nenhum desafio ainda. Lance o primeiro.</Text>
        </View>
      ) : (
        ordenados.map((desafio) => {
          const situacao = situacaoDoDesafio(desafio);
          const selo = SELO[situacao];
          const minha = placarDaEquipe(desafio, desafio.minhaEquipe);
          const outraEquipe = desafio.minhaEquipe === 1 ? 2 : 1;
          const outra = placarDaEquipe(desafio, outraEquipe);
          const temAdversario = desafio.formato !== "guilda";
          return (
            <View key={desafio.id} style={s.card}>
              <View style={s.cardTopo}>
                <View style={[s.selo, { borderColor: selo.cor }]}>
                  <MaterialCommunityIcons name={selo.icone} size={13} color={selo.cor} />
                  <Text style={[s.seloTexto, { color: selo.cor }]}>{selo.texto}</Text>
                </View>
                <Text style={s.cardMeta}>
                  {ROTULO_DO_FORMATO[desafio.formato]} · {ROTULO_DO_MODO[desafio.modo]} · {desafio.questoes} questões
                </Text>
              </View>

              {desafio.guildaNome ? <Text style={s.guilda}>Guilda {desafio.guildaNome}</Text> : null}

              <View style={s.placar}>
                <View style={s.lado}>
                  <Text style={[s.pontos, { color: accent }]}>{minha.pontos}</Text>
                  <Text style={s.ladoRotulo}>{temAdversario ? "VOCÊ" : "SUA GUILDA"}</Text>
                  <Text numberOfLines={2} style={s.integrantes}>
                    {integrantesDaEquipe(desafio, desafio.minhaEquipe).map((p) => p.apelido || p.nome).join(", ") || "—"}
                  </Text>
                </View>
                {temAdversario ? (
                  <>
                    <Text style={s.versus}>×</Text>
                    <View style={s.lado}>
                      <Text style={s.pontos}>{outra.pontos}</Text>
                      <Text style={s.ladoRotulo}>ADVERSÁRIO</Text>
                      <Text numberOfLines={2} style={s.integrantes}>
                        {integrantesDaEquipe(desafio, outraEquipe).map((p) => p.apelido || p.nome).join(", ") || "—"}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {desafio.modo === "velocidade" ? (
                <Text style={s.tempo}>
                  Tempo: {formatarTempo(minha.tempoMs)}
                  {temAdversario ? ` · adversário ${formatarTempo(outra.tempoMs)}` : ""}
                </Text>
              ) : null}

              {situacao === "convite" ? (
                <View style={s.formAcoes}>
                  <Pressable
                    disabled={ocupado === desafio.id}
                    onPress={() => void agir(desafio.id, () => responderConvite(desafio.id, false))}
                    style={s.secondary}
                  >
                    <Text style={s.secondaryText}>Recusar</Text>
                  </Pressable>
                  <Pressable
                    disabled={ocupado === desafio.id}
                    onPress={() => void agir(desafio.id, () => responderConvite(desafio.id, true))}
                    style={[s.primary, s.formPrimary, { backgroundColor: accent }]}
                  >
                    <Text style={s.primaryText}>{ocupado === desafio.id ? "..." : "Aceitar"}</Text>
                  </Pressable>
                </View>
              ) : situacao === "jogando" ? (
                <Pressable onPress={() => setRodadaAberta(desafio.id)} style={[s.primary, { backgroundColor: accent }]}>
                  <Text style={s.primaryText}>
                    Continuar ({desafio.minhasRespostas}/{desafio.questoes})
                  </Text>
                </Pressable>
              ) : situacao === "recusado" ? null : (
                <Pressable onPress={() => setRodadaAberta(desafio.id)} style={[s.chatButton, { borderColor: accent }]}>
                  <Text style={[s.chatButtonText, { color: accent }]}>Ver respostas</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}

      <ArenaRoundModal
        visible={rodadaAberta !== null}
        desafioId={rodadaAberta}
        accent={accent}
        onClose={(mudou) => {
          setRodadaAberta(null);
          if (mudou) void onReload();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 12 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, gap: 12 },
  headingTexto: { flex: 1 },
  title: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 16, letterSpacing: 1 },
  subtitle: { color: "rgba(242,247,250,.62)", fontSize: 12, marginTop: 3 },
  erro: { color: "#f87171", fontSize: 12 },
  form: { gap: 9, padding: 15, borderRadius: 14, backgroundColor: "#171638" },
  formTitulo: { color: "#9db8ff", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: "rgba(242,247,250,.25)", borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipOff: { opacity: 0.35 },
  chipTexto: { color: "#c7c5d2", fontSize: 11, fontWeight: "800" },
  chipTextoAtivo: { color: "#fff" },
  explicacao: { color: "#8f8da3", fontSize: 11, lineHeight: 16 },
  pessoas: { gap: 8, paddingVertical: 2 },
  pessoa: { borderColor: "rgba(242,247,250,.22)", borderRadius: 9, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, maxWidth: 140 },
  pessoaNome: { color: "#e6e4ef", fontSize: 12 },
  impedimento: { color: "#fbbf24", fontSize: 11, marginTop: 2 },
  formAcoes: { flexDirection: "row", gap: 10, marginTop: 4 },
  formPrimary: { flex: 1 },
  primary: { alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  primaryText: { color: Color.colorWhite, fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 },
  secondary: { alignItems: "center", borderColor: "rgba(242,247,250,.3)", borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryText: { color: "#c7c5d2", fontSize: 12, fontWeight: "700" },
  vazio: { alignItems: "center", gap: 12, padding: 30, borderRadius: 14, backgroundColor: "rgba(242,247,250,.06)" },
  vazioTexto: { color: "#c7c5d2", textAlign: "center", fontSize: 13 },
  card: { padding: 15, borderRadius: 14, backgroundColor: "rgba(242,247,250,.08)", gap: 11 },
  cardTopo: { gap: 7 },
  selo: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  seloTexto: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  cardMeta: { color: "#8f8da3", fontSize: 11 },
  guilda: { color: "#9db8ff", fontSize: 12, fontWeight: "700" },
  placar: { flexDirection: "row", alignItems: "center", gap: 10 },
  lado: { flex: 1, alignItems: "center", gap: 2 },
  pontos: { color: "#f2f7fa", fontFamily: FontFamily.poppinsExtraBold, fontSize: 28 },
  ladoRotulo: { color: "#8f8da3", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  integrantes: { color: "#c7c5d2", fontSize: 11, textAlign: "center" },
  versus: { color: "#6b6a7d", fontFamily: FontFamily.poppinsExtraBold, fontSize: 18 },
  tempo: { color: "#8f8da3", fontSize: 11, textAlign: "center" },
  chatButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  chatButtonText: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 12 },
});
