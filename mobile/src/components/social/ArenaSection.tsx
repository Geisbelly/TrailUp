import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { DesafioModal } from "@/components/social/DesafioModal";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import type { Guild } from "@/services/social/guildModel";
import type { SocialPerson } from "@/services/social/socialModel";
import {
  argumentosDeCriacao,
  mensagemDaArena,
  pendentes,
  resultadoParaMim,
  rotuloDoElo,
  situacaoNaArena,
  tituloDoDesafio,
  validarNovoDesafio,
  type DesafioDaArena,
  type FormatoDaArena,
  type ModoDaArena,
} from "@/services/social/arenaModel";
import { carregarArena, criarDesafioNaArena, responderConviteDaArena } from "@/services/social/guildService";

type Props = {
  classeId: number;
  meuId: string | null;
  people: SocialPerson[];
  guilds: Guild[];
  accent: string;
  profile?: string | null;
};

const FORMATOS: { key: FormatoDaArena; label: string }[] = [
  { key: "solo", label: "Duelo 1x1" },
  { key: "dupla", label: "Dupla 2x2" },
  { key: "guilda", label: "Guilda x guilda" },
];
const MODOS: { key: ModoDaArena; label: string }[] = [
  { key: "precisao", label: "Precisão" },
  { key: "velocidade", label: "Velocidade" },
  { key: "todos", label: "Todos" },
];
const QUANTIDADE = 5;

const RESULTADO: Record<string, string> = {
  vitoria: "Vitória",
  derrota: "Derrota",
  empate: "Empate",
  sem_adversario: "Sem adversário (não vale Elo)",
};

/**
 * A arena (20261021_19): desafio ranqueado com adversário, que vale Elo. Cria, aceita ou recusa
 * convite e abre a partida no `DesafioModal`, que responde por `arena_responder` quando o
 * desafio tem equipe 2.
 */
export function ArenaSection({ classeId, meuId, people, guilds, accent, profile }: Props) {
  const palette = getProfileShellPalette(profile);
  const [lista, setLista] = useState<DesafioDaArena[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formato, setFormato] = useState<FormatoDaArena>("solo");
  const [modo, setModo] = useState<ModoDaArena>("precisao");
  const [aliado, setAliado] = useState<string | null>(null);
  const [adversarios, setAdversarios] = useState<string[]>([]);
  const [rival, setRival] = useState<string | null>(null);
  const [jogando, setJogando] = useState<string | null>(null);

  const colegas = useMemo(
    () => people.filter((p) => p.status !== "blocked" && p.alunoId !== meuId),
    [people, meuId],
  );
  const minhaGuilda = guilds.find((g) => g.souMembro) ?? null;
  const rivais = guilds.filter((g) => !g.souMembro && g.membrosAtivos > 0);

  const recarregar = useCallback(async () => {
    if (classeId <= 0) return;
    setCarregando(true);
    try {
      setLista(await carregarArena(classeId));
    } catch (error) {
      setAviso(mensagemDaArena(error));
    } finally {
      setCarregando(false);
    }
  }, [classeId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  function trocarFormato(f: FormatoDaArena) {
    setFormato(f);
    setAliado(null);
    setAdversarios([]);
    setRival(null);
    setAviso(null);
  }

  function alternarAdversario(id: string) {
    const max = formato === "dupla" ? 2 : 1;
    setAdversarios((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : max === 1 ? [id] : [...atual, id].slice(-max),
    );
    if (aliado === id) setAliado(null);
  }

  function alternarAliado(id: string) {
    setAliado((atual) => (atual === id ? null : id));
    setAdversarios((atual) => atual.filter((x) => x !== id));
  }

  const novo = { formato, aliado, adversarios, guildaId: minhaGuilda?.id ?? null, guildaRival: rival };
  const problema = validarNovoDesafio(novo, meuId);

  async function criar() {
    if (problema || ocupado) return;
    setOcupado("criar");
    setAviso(null);
    try {
      await criarDesafioNaArena(argumentosDeCriacao(classeId, novo, modo, QUANTIDADE));
      trocarFormato(formato);
      setAviso("Desafio enviado. O convite fica aberto por cerca de 24 h; vale quando o adversário aceitar.");
      await recarregar();
    } catch (error) {
      setAviso(mensagemDaArena(error));
    } finally {
      setOcupado(null);
    }
  }

  async function convite(d: DesafioDaArena, aceitar: boolean) {
    setOcupado(d.id);
    setAviso(null);
    try {
      const r = (await responderConviteDaArena(d.id, aceitar)) as { encerrou?: boolean };
      // Recusa fecha na hora quando não sobra adversário (sem Elo para ninguém).
      if (!aceitar) setAviso(r.encerrou ? "Desafio recusado e encerrado." : "Desafio recusado.");
      await recarregar();
      if (aceitar) setJogando(d.id);
    } catch (error) {
      setAviso(mensagemDaArena(error));
    } finally {
      setOcupado(null);
    }
  }

  const chip = (ativo: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      style={[s.chip, { borderColor: ativo ? accent : palette.border, backgroundColor: ativo ? accent : "transparent" }]}
    >
      <Text style={[s.chipTexto, { color: ativo ? palette.background : palette.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.raiz}>
      <View style={[s.caixa, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={s.cabecalho}>
          <MaterialCommunityIcons name="sword-cross" size={20} color={accent} />
          <Text style={[s.titulo, { color: palette.text }]}>Novo desafio</Text>
          <Text style={[s.selo, { color: accent, borderColor: accent }]}>Vale Elo</Text>
        </View>
        <View style={s.linha}>{FORMATOS.map((f) => chip(formato === f.key, f.label, () => trocarFormato(f.key), f.key))}</View>

        {formato === "guilda" ? (
          <>
            <Text style={[s.rotulo, { color: palette.textMuted }]}>
              {minhaGuilda ? `Sua guilda: ${minhaGuilda.nome}. Rival:` : "Entre numa guilda para desafiar outra."}
            </Text>
            {minhaGuilda ? (
              <View style={s.linha}>
                {rivais.length
                  ? rivais.map((g) => chip(rival === g.id, g.nome, () => setRival(rival === g.id ? null : g.id), g.id))
                  : <Text style={{ color: palette.textMuted }}>Nenhuma outra guilda com membros.</Text>}
              </View>
            ) : null}
          </>
        ) : (
          <>
            {formato === "dupla" ? (
              <>
                <Text style={[s.rotulo, { color: palette.textMuted }]}>Sua dupla</Text>
                <View style={s.linha}>{colegas.map((p) => chip(aliado === p.alunoId, p.apelido ?? p.nome, () => alternarAliado(p.alunoId), `a-${p.alunoId}`))}</View>
              </>
            ) : null}
            <Text style={[s.rotulo, { color: palette.textMuted }]}>{formato === "dupla" ? "Adversários (2)" : "Adversário"}</Text>
            <View style={s.linha}>
              {colegas.length
                ? colegas.map((p) => chip(adversarios.includes(p.alunoId), p.apelido ?? p.nome, () => alternarAdversario(p.alunoId), `x-${p.alunoId}`))
                : <Text style={{ color: palette.textMuted }}>Nenhum colega disponível.</Text>}
            </View>
          </>
        )}

        <Text style={[s.rotulo, { color: palette.textMuted }]}>Modo · {QUANTIDADE} questões · uma tentativa cada</Text>
        <View style={s.linha}>{MODOS.map((m) => chip(modo === m.key, m.label, () => setModo(m.key), m.key))}</View>

        <Pressable
          disabled={Boolean(problema) || ocupado !== null}
          onPress={() => void criar()}
          style={[s.botao, { backgroundColor: problema || ocupado ? palette.borderStrong : accent }]}
        >
          <Text style={[s.botaoTexto, { color: palette.background }]}>{ocupado === "criar" ? "Enviando..." : "Desafiar"}</Text>
        </Pressable>
        {problema ? <Text style={[s.dica, { color: palette.textMuted }]}>{problema}</Text> : null}
      </View>

      {aviso ? <Text style={[s.aviso, { color: palette.text }]}>{aviso}</Text> : null}

      {carregando && !lista.length ? (
        <ActivityIndicator color={accent} />
      ) : !lista.length ? (
        <Text style={[s.dica, { color: palette.textMuted }]}>Nenhuma partida ainda. Desafie um colega!</Text>
      ) : (
        lista.map((d) => {
          const situacao = situacaoNaArena(d);
          const resultado = resultadoParaMim(d);
          const esperando = pendentes(d);
          return (
            <View key={d.id} style={[s.caixa, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[s.titulo, { color: palette.text }]}>{tituloDoDesafio(d, meuId)}</Text>
              <Text style={[s.rotulo, { color: palette.textMuted }]}>
                {FORMATOS.find((f) => f.key === d.formato)?.label ?? d.formato} · {MODOS.find((m) => m.key === d.modo)?.label ?? d.modo} · {d.minhasRespostas}/{d.questoes}
              </Text>
              {situacao === "convite" ? (
                <View style={s.linha}>
                  {chip(false, ocupado === d.id ? "..." : "Aceitar", () => void convite(d, true), "aceitar")}
                  {chip(false, "Recusar", () => void convite(d, false), "recusar")}
                </View>
              ) : situacao === "jogar" ? (
                <View style={s.linha}>{chip(true, "Jogar", () => setJogando(d.id), "jogar")}</View>
              ) : situacao === "aguardando" ? (
                <Text style={[s.dica, { color: palette.textMuted }]}>
                  {esperando.length
                    ? `Aguardando ${esperando.map((p) => p.nome).join(", ")} aceitar.`
                    : "Você terminou. Aguardando os outros responderem."}
                </Text>
              ) : situacao === "encerrado" ? (
                <Text style={[s.resultado, { color: resultado === "vitoria" ? "#62db9b" : resultado === "derrota" ? "#ff9c9c" : palette.text }]}>
                  {resultado ? RESULTADO[resultado] : "Encerrado"}
                  {d.meuElo ? ` · ${rotuloDoElo(d.meuElo)} (${d.meuElo.ratingDepois})` : ""}
                </Text>
              ) : (
                <Text style={[s.dica, { color: palette.textMuted }]}>Você recusou este desafio.</Text>
              )}
            </View>
          );
        })
      )}

      <DesafioModal
        visible={jogando !== null}
        desafioId={jogando}
        accent={accent}
        profile={profile}
        onClose={() => {
          setJogando(null);
          void recarregar();
        }}
        onEncerrou={() => void recarregar()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: 12 },
  caixa: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 8 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 16, flexShrink: 1 },
  selo: { marginLeft: "auto", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11 },
  rotulo: { fontSize: 12 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipTexto: { fontSize: 13 },
  botao: { borderRadius: 12, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  botaoTexto: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
  dica: { fontSize: 12 },
  aviso: { fontSize: 13, textAlign: "center" },
  resultado: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
});
