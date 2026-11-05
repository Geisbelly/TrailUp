import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FramedProfileImage } from "@/components/FramedProfileImage";
import { ProfileEmblem } from "@/components/ProfileEmblem";
import { UtilityIcon, type UtilityIconKind } from "@/components/UtilityIcon";
import { RankingPodium } from "@/components/ranking/RankingPodium";
import { getProfileArtwork } from "@/constants/designAssets";
import { useRankingPeople } from "@/hooks/useRankingPeople";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { formatRankScore } from "@/utils/rankingPodium";
import { carregarRanksDoEvento, estouNoRank, mudarInscricao } from "@/services/eventos/eventosDaTurma";
import { DueloNoEvento } from "./DueloNoEvento";
import {
  enfaseDoRank,
  fraseDoRank,
  mensagemDaInscricao,
  podeDuelarNoEvento,
  podeMexerNaInscricao,
  vizinhanca,
  type BlocoDoRank,
  type EventoDaTurma,
  type FocoDoRank,
  type LinhaDoRank,
  type RankDoEvento as Rank,
} from "@/services/eventos/eventoModel";

type Props = {
  evento: EventoDaTurma;
  classeId: number;
  meuId: string | null;
  palette: ProfileShellPalette;
};

const ROTULO_CURTO: Record<string, string> = { ranqueada: "Batalha", pontuacao: "Pontuação", missoes: "Missões", tempo: "Tempo" };
const ICONE_DO_FOCO: Record<Exclude<FocoDoRank, "gente">, UtilityIconKind> = {
  rival: "medal",
  meta: "medal",
  regra: "hint",
  seguro: "hint",
  explorar: "book",
};

function dia(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * O rank do evento (#155): opcional, só de quem entra. Desenho em
 * `docs/superpowers/specs/2026-11-04-rank-do-evento-no-app-desenho.md` e no protótipo
 * `prototipos/aluno/mobile-v1/06b-rank-do-evento.html`.
 *
 * As peças são as mesmas para todos (a arena do perfil, o seletor de critério, o pódio do Ranking e a
 * vizinhança); o perfil muda a frase do bloco de foco e a ordem dos blocos (`enfaseDoRank`).
 * Entrar é o botão principal e sair fica sempre à vista: ficar de fora não custa nota nem XP, e sair
 * não pode ser mais difícil do que entrar.
 */
export function RankDoEvento({ evento, classeId, meuId, palette }: Props) {
  const [inscrito, setInscrito] = useState<boolean | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [completo, setCompleto] = useState(false);
  const [erroCarga, setErroCarga] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [mudando, setMudando] = useState(false);
  const podeMexer = podeMexerNaInscricao(evento);
  const enfase = enfaseDoRank(palette.profile);
  const [regrasAbertas, setRegrasAbertas] = useState(enfase.foco === "regra");

  const carregar = useCallback(async () => {
    try {
      const [estou, lista] = await Promise.all([estouNoRank(evento.id), carregarRanksDoEvento(evento.id, meuId)]);
      setInscrito(estou);
      setRanks(lista);
      setErroCarga(false);
    } catch (e) {
      console.warn("[Evento] Falha ao carregar o rank do evento:", e);
      setErroCarga(true);
    }
  }, [evento.id, meuId]);

  useEffect(() => {
    setInscrito(null);
    setAtivo(0);
    setCompleto(false);
    void carregar();
  }, [carregar]);

  const rank = ranks[Math.min(ativo, Math.max(0, ranks.length - 1))] ?? null;
  const ids = useMemo(() => Array.from(new Set(ranks.flatMap((r) => r.linhas.map((l) => l.alunoId)))), [ranks]);
  const { profiles, photos } = useRankingPeople(classeId, ids, meuId ?? undefined, palette.profile);

  const alternar = async () => {
    if (inscrito === null || mudando) return;
    setMudando(true);
    setErroAcao(null);
    try {
      await mudarInscricao(evento.id, !inscrito);
      await carregar();
    } catch (e) {
      setErroAcao(mensagemDaInscricao(e));
    } finally {
      setMudando(false);
    }
  };

  const aberto = evento.status === "aberto";
  const fim = dia(evento.fim);
  const souDoRank = Boolean(inscrito && rank?.linhas.some((l) => l.eu));
  const linhas = rank?.linhas ?? [];

  // --- Cabeçalho: a arena do perfil, como a Arena do 06-social e o vazio do Ranking. ---
  const cabecalho = (
    <>
      <View style={[s.arte, { pointerEvents: "none" }]} accessible={false}>
        <Image source={getProfileArtwork(palette.profile, "rank")} resizeMode="cover" style={s.arena} />
        <LinearGradient colors={[`${palette.background}8c`, `${palette.surface}e0`, palette.surface]} locations={[0, 0.62, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={s.cab}>
        <UtilityIcon kind="medal" profile={palette.profile} size={42} />
        <View style={s.cabTexto}>
          <Text numberOfLines={1} style={[s.eyebrow, { color: palette.accent }]}>
            {evento.titulo.toUpperCase()}
          </Text>
          <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>
            Rank do evento
          </Text>
        </View>
      </View>
      <View style={s.chips}>
        {inscrito !== null && !erroCarga ? (
          <View style={[s.chip, { backgroundColor: palette.surfaceElevated }]}>
            <Text style={[s.chipTexto, { color: palette.textMuted }]}>
              {linhas.length ? `${linhas.length} ${linhas.length === 1 ? "inscrito" : "inscritos"}` : "Ninguém inscrito"}
            </Text>
          </View>
        ) : null}
        {fim ? (
          <View style={[s.chip, { backgroundColor: palette.surfaceElevated }]}>
            <Text style={[s.chipTexto, { color: palette.textMuted }]}>{aberto ? `até ${fim}` : `Encerrado em ${fim}`}</Text>
          </View>
        ) : null}
        {inscrito ? (
          <View style={[s.chip, { backgroundColor: palette.accentMuted, borderColor: palette.accentSoft, borderWidth: 1 }]}>
            <Text style={[s.chipTexto, { color: palette.accent }]}>Você está no rank</Text>
          </View>
        ) : null}
      </View>
      {ranks.length > 1 ? (
        <View accessibilityRole="tablist" style={[s.criterios, { borderColor: palette.border, backgroundColor: `${palette.background}8c` }]}>
          {ranks.map((r, i) => {
            const sel = i === ativo;
            return (
              <Pressable
                key={r.rankId}
                accessibilityRole="tab"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`Critério: ${r.nome}`}
                onPress={() => {
                  setAtivo(i);
                  setCompleto(false);
                }}
                style={[s.criterio, sel && { backgroundColor: palette.surfaceElevated, borderColor: palette.accentSoft }]}
              >
                <Text style={[s.criterioTexto, { color: sel ? palette.text : palette.textMuted }]}>{ROTULO_CURTO[r.criterio] ?? r.nome}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );

  const caixa = (conteudo: React.ReactNode) => (
    <View accessibilityLabel="Rank do evento" style={[s.caixa, { backgroundColor: palette.surface, borderColor: inscrito ? palette.accent : palette.border }]}>
      {cabecalho}
      <View style={s.corpo}>{conteudo}</View>
    </View>
  );

  if (erroCarga)
    return caixa(
      <>
        <View style={s.linhaErro}>
          <MaterialCommunityIcons name="alert-outline" size={20} color={palette.textMuted} />
          <Text style={[s.texto, s.flex, { color: palette.textMuted }]}>Não foi possível carregar o rank. O resto do evento continua aqui.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void carregar()} style={[s.botao, s.botaoSecundario, { borderColor: palette.borderStrong, backgroundColor: palette.surface }]}>
          <Text style={[s.botaoTexto, { color: palette.text }]}>Tentar de novo</Text>
        </Pressable>
      </>,
    );

  if (inscrito === null || !rank)
    return caixa(<ActivityIndicator color={palette.textMuted} accessibilityLabel="Carregando o rank do evento" style={s.carregando} />);

  // --- Blocos ---
  const frase = fraseDoRank(palette.profile, evento, rank, inscrito, ranks.filter((r) => r.rankId !== rank.rankId));
  const eu = linhas.find((l) => l.eu);
  const foco = souDoRank && eu ? (
    <View
      key="foco"
      accessible
      accessibilityLabel={`Sua posição: ${eu.posicao}º de ${linhas.length}. ${frase.titulo} ${frase.detalhe}`}
      style={[s.eu, { backgroundColor: palette.accentMuted, borderColor: palette.accentSoft }]}
    >
      <Text style={[s.euPos, { color: palette.accent }]}>
        {eu.posicao}
        <Text style={s.euOrdinal}>º</Text>
      </Text>
      <View style={s.flex}>
        <Text style={[s.fraseTitulo, { color: palette.text }]}>{frase.titulo}</Text>
        <Text style={[s.texto, { color: palette.textMuted }]}>{frase.detalhe}</Text>
      </View>
    </View>
  ) : (
    <View key="foco" accessible accessibilityLabel={`${frase.titulo} ${frase.detalhe}`} style={[s.foco, { backgroundColor: `${palette.background}8c`, borderColor: palette.border }]}>
      {enfase.foco === "gente" && linhas.length ? (
        <View style={s.rostos}>
          {linhas.slice(0, 4).map((l, i) => (
            <View key={l.alunoId} style={[s.rosto, i > 0 && s.rostoSobre]}>
              <FramedProfileImage profile={profiles[l.alunoId]?.key ?? null} source={photos[l.alunoId] ? { uri: photos[l.alunoId] } : undefined} size={34} />
            </View>
          ))}
        </View>
      ) : (
        <UtilityIcon kind={ICONE_DO_FOCO[enfase.foco === "gente" ? "rival" : enfase.foco]} profile={palette.profile} size={38} />
      )}
      <Text style={[s.texto, s.flex, { color: palette.textMuted }]}>
        <Text style={[s.negrito, { color: palette.text }]}>{frase.titulo}</Text> {frase.detalhe}
      </Text>
    </View>
  );

  const podio = linhas.length ? (
    <View key="podio">
      <RankingPodium
        rows={linhas.map((l) => ({ id_aluno: l.alunoId, posicao: l.posicao, nome_aluno: l.eu ? "Você" : l.nome, pontuacao: l.pontos }))}
        criterion={rank.criterio}
        palette={palette}
        userId={meuId ?? undefined}
        profiles={profiles}
        photos={photos}
      />
    </View>
  ) : (
    <View key="podio" style={s.vazio}>
      <Text style={[s.vazioTitulo, { color: palette.text }]}>Ninguém entrou ainda</Text>
      <Text style={[s.texto, s.centro, { color: palette.textMuted }]}>O rank do evento é opcional. Quem entrar primeiro abre a disputa.</Text>
    </View>
  );

  const linhaDaLista = (l: LinhaDoRank) => (
    <View
      key={l.alunoId}
      accessible
      accessibilityLabel={`${l.posicao}º, ${l.eu ? "você" : l.nome}, ${formatRankScore(l.pontos, rank.criterio)}`}
      style={[
        s.linha,
        { borderBottomColor: palette.border },
        l.eu && { backgroundColor: palette.surfaceElevated, borderLeftColor: palette.accent, borderLeftWidth: 3 },
      ]}
    >
      <Text style={[s.linhaPos, { color: l.eu ? palette.accent : palette.textMuted }]}>{l.posicao}º</Text>
      <ProfileEmblem profile={profiles[l.alunoId]?.key} toneProfile={palette.profile} size={32} />
      <Text numberOfLines={1} style={[s.linhaNome, { color: l.eu ? palette.accent : palette.text }, l.eu && s.negrito]}>
        {l.eu ? "Você" : l.nome}
      </Text>
      <Text style={[s.linhaPontos, { color: l.eu ? palette.accent : palette.text }]}>{formatRankScore(l.pontos, rank.criterio)}</Text>
    </View>
  );

  const vizinhos = vizinhanca(rank);
  const lista = completo ? (
    <View key="vizinhanca" style={[s.lista, { borderTopColor: palette.border }]}>
      {linhas.filter((l) => l.posicao > 3).map(linhaDaLista)}
    </View>
  ) : vizinhos.length ? (
    <View key="vizinhanca" accessibilityLabel="Sua vizinhança no rank" style={[s.lista, { borderTopColor: palette.border }]}>
      {vizinhos.map((item) =>
        item.tipo === "salto" ? (
          <Text key={item.chave} accessible={false} style={[s.salto, { color: palette.textSubtle, borderBottomColor: palette.border }]}>
            · · ·
          </Text>
        ) : (
          linhaDaLista(item.linha)
        ),
      )}
    </View>
  ) : null;

  const blocos: Record<BlocoDoRank, React.ReactNode> = { foco, podio, vizinhanca: lista };
  const temMais = linhas.filter((l) => l.posicao > 3).length > vizinhos.filter((x) => x.tipo === "linha").length;

  return caixa(
    <>
      {enfase.ordem.map((b) => blocos[b])}

      {erroAcao ? (
        <Text accessibilityRole="alert" style={[s.texto, { color: palette.textMuted }]}>
          {erroAcao}
        </Text>
      ) : null}

      {podeMexer && !inscrito ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: mudando, busy: mudando }}
            disabled={mudando}
            onPress={() => void alternar()}
            style={[s.botao, { backgroundColor: palette.accent, opacity: mudando ? 0.7 : 1 }]}
          >
            <Text style={[s.botaoTexto, { color: palette.background }]}>{mudando ? "Um instante…" : "Entrar no rank"}</Text>
          </Pressable>
          <Text style={[s.opcional, { color: palette.textSubtle }]}>
            Opcional: entrar ou ficar de fora não muda sua nota nem seu XP. Dá para sair quando quiser enquanto o evento estiver aberto.
          </Text>
        </>
      ) : null}

      {inscrito && (podeMexer || temMais) ? (
        <View style={s.acoes}>
          {temMais ? (
            <Pressable accessibilityRole="button" onPress={() => setCompleto((v) => !v)} style={s.link}>
              <Text style={[s.linkTexto, { color: palette.accent }]}>{completo ? "Ver só perto de mim" : "Ver rank completo"}</Text>
            </Pressable>
          ) : (
            <View style={s.flex} />
          )}
          {podeMexer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: mudando, busy: mudando }}
              disabled={mudando}
              onPress={() => void alternar()}
              style={[s.botao, s.botaoSecundario, s.botaoSair, { borderColor: palette.borderStrong, backgroundColor: palette.surface, opacity: mudando ? 0.7 : 1 }]}
            >
              <Text style={[s.botaoTexto, { color: palette.text }]}>{mudando ? "Um instante…" : "Sair do rank"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {podeDuelarNoEvento(evento, inscrito, ranks) ? <DueloNoEvento evento={evento} palette={palette} onEnviado={() => void carregar()} /> : null}

      <View style={[s.regras, { borderTopColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: regrasAbertas }}
          onPress={() => setRegrasAbertas((v) => !v)}
          style={s.regrasBotao}
        >
          <Text style={[s.linkTexto, { color: palette.accent }]}>Como funciona</Text>
          <MaterialCommunityIcons name={regrasAbertas ? "chevron-up" : "chevron-down"} size={18} color={palette.accent} />
        </Pressable>
        {regrasAbertas ? (
          <Text style={[s.texto, { color: palette.textMuted }]}>
            Só aparece quem escolheu entrar. Cada critério é um rank, contado só na janela do evento, com os mesmos números do ranking da
            turma. Entrar ou sair não muda nota, XP nem o ranking da turma. Em Batalha contam os duelos do evento, contra colegas do rank
            com desempenho parecido; quem perde não perde ponto.
          </Text>
        ) : null}
      </View>
    </>,
  );
}

const s = StyleSheet.create({
  caixa: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  arte: { position: "absolute", left: 0, right: 0, top: 0, height: 210, overflow: "hidden" },
  arena: { width: "100%", height: "100%", opacity: 0.6 },
  cab: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  cabTexto: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 20, lineHeight: 25, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, marginTop: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 11.5, fontWeight: "600" },
  criterios: { flexDirection: "row", gap: 4, marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: 8, borderWidth: 1 },
  criterio: { flex: 1, minHeight: 40, borderRadius: 6, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  criterioTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  corpo: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 14 },
  carregando: { marginVertical: 18 },
  foco: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, borderWidth: 1 },
  rostos: { flexDirection: "row" },
  rosto: { width: 34, height: 34 },
  rostoSobre: { marginLeft: -10 },
  eu: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
  euPos: { fontFamily: FontFamily.inikaBold, fontSize: 34, lineHeight: 38, fontWeight: "700" },
  euOrdinal: { fontSize: 16 },
  fraseTitulo: { fontFamily: FontFamily.interMedium, fontSize: 14.5, fontWeight: "700", lineHeight: 20 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  negrito: { fontWeight: "700" },
  flex: { flex: 1, minWidth: 0 },
  centro: { textAlign: "center" },
  vazio: { alignItems: "center", gap: 6, paddingVertical: 10 },
  vazioTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 16 },
  lista: { borderTopWidth: 1 },
  linha: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderBottomWidth: 1, paddingHorizontal: 6 },
  linhaPos: { fontFamily: FontFamily.inikaBold, fontSize: 14, width: 30 },
  linhaNome: { flex: 1, minWidth: 0, fontFamily: FontFamily.interMedium, fontSize: 14 },
  linhaPontos: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  salto: { textAlign: "center", fontSize: 12, lineHeight: 22, borderBottomWidth: 1, borderStyle: "dashed" },
  linhaErro: { flexDirection: "row", alignItems: "center", gap: 10 },
  botao: { minHeight: 48, borderRadius: 6, borderWidth: 1, borderColor: "transparent", paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  botaoSecundario: { borderWidth: 1 },
  botaoSair: { flexShrink: 0 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
  opcional: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18, marginTop: -6 },
  acoes: { flexDirection: "row", alignItems: "center", gap: 10 },
  link: { minHeight: 44, justifyContent: "center", flex: 1 },
  linkTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  regras: { borderTopWidth: 1, paddingBottom: 10 },
  regrasBotao: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 },
});
