import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArenaLobby, type InicioDoLobby } from "@/components/social/ArenaLobby";
import { DesafioModal } from "@/components/social/DesafioModal";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import type { Guild } from "@/services/social/guildModel";
import type { SocialPerson } from "@/services/social/socialModel";
import {
  mensagemDaArena,
  pendentes,
  resultadoParaMim,
  rotuloDoElo,
  situacaoNaArena,
  tituloDoDesafio,
  type DesafioDaArena,
  type FormatoDaArena,
  type ModoDaArena,
} from "@/services/social/arenaModel";
import { carregarArena, responderConviteDaArena } from "@/services/social/guildService";

type Props = {
  classeId: number;
  meuId: string | null;
  people: SocialPerson[];
  guilds: Guild[];
  accent: string;
  profile?: string | null;
  /**
   * "Desafiar" no cartão do amigo (web em tela larga, #508): já abre o duelo 1x1 com ele
   * escolhido. `chave` muda a cada clique, para repetir o mesmo amigo.
   */
  dueloCom?: { alunoId: string; chave: number } | null;
  /** O "Entrar na arena" do cartão em destaque: abre o lobby. Muda a cada toque. */
  abrirLobby?: number;
  /** Sem o cartão de entrada quando o destaque da Arena, com o mesmo botão, já está logo acima. */
  semEntrada?: boolean;
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
const RESULTADO: Record<string, string> = {
  vitoria: "Vitória",
  derrota: "Derrota",
  empate: "Empate",
  sem_adversario: "Sem adversário (não vale Elo)",
};

/**
 * A arena (20261021_19): desafio ranqueado com adversário, que vale Elo. "Entrar na arena" abre o
 * lobby (`ArenaLobby`: modo, adversário escolhido ou sorteado, começar); aqui ficam as partidas,
 * o aceite ou recusa do convite e a partida no `DesafioModal`, que responde por `arena_responder`
 * quando o desafio tem equipe 2.
 */
export function ArenaSection({ classeId, meuId, people, guilds, accent, profile, dueloCom, abrirLobby, semEntrada = false }: Props) {
  const palette = getProfileShellPalette(profile);
  const [lista, setLista] = useState<DesafioDaArena[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lobby, setLobby] = useState<{ inicio: InicioDoLobby } | null>(null);
  const [jogando, setJogando] = useState<string | null>(null);

  const colegas = useMemo(
    () => people.filter((p) => p.status !== "blocked" && p.alunoId !== meuId),
    [people, meuId],
  );
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

  useEffect(() => {
    if (!dueloCom) return;
    setAviso(null);
    setLobby({ inicio: { formato: "solo", adversarios: [dueloCom.alunoId] } });
  }, [dueloCom]);

  useEffect(() => {
    if (!abrirLobby) return;
    setAviso(null);
    setLobby({ inicio: null });
  }, [abrirLobby]);

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
      {semEntrada ? null : <Pressable onPress={() => { setAviso(null); setLobby({ inicio: null }); }} accessibilityRole="button" accessibilityLabel="Entrar na arena. Vale Elo."
        style={[s.caixa, s.entrar, { backgroundColor: palette.surface, borderColor: accent }]}>
        <View style={[s.entrarIcone, { backgroundColor: accent }]}>
          <MaterialCommunityIcons name="sword-cross" size={24} color={palette.background} />
        </View>
        <View style={s.entrarTexto}>
          <Text style={[s.titulo, { color: palette.text }]}>Entrar na arena</Text>
          <Text style={[s.rotulo, { color: palette.textMuted }]}>Escolha o modo e o adversário, ou sorteie um.</Text>
        </View>
        <Text style={[s.selo, { color: accent, borderColor: accent }]}>Vale Elo</Text>
      </Pressable>}

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

      <ArenaLobby
        visible={lobby !== null}
        inicio={lobby?.inicio ?? null}
        classeId={classeId}
        meuId={meuId}
        colegas={colegas}
        guilds={guilds}
        palette={palette}
        onClose={() => setLobby(null)}
        onCriado={(texto) => {
          setAviso(texto);
          void recarregar();
        }}
      />

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
  entrar: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, minHeight: 72 },
  entrarIcone: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  entrarTexto: { flex: 1, gap: 2 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 16, flexShrink: 1 },
  selo: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11 },
  rotulo: { fontSize: 12 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipTexto: { fontSize: 13 },
  dica: { fontSize: 12 },
  aviso: { fontSize: 13, textAlign: "center" },
  resultado: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
});
