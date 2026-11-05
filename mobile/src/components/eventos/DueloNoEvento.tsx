import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { QUANTIDADE_DA_ARENA } from "@/components/social/ArenaLobby";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { duelarNoEvento, sugerirAdversariosNoEvento } from "@/services/eventos/eventosDaTurma";
import type { EventoDaTurma, SugeridoNoEvento } from "@/services/eventos/eventoModel";
import { mensagemDaArena, type ModoDaArena } from "@/services/social/arenaModel";

const MODOS: { key: ModoDaArena; label: string }[] = [
  { key: "precisao", label: "Precisão" },
  { key: "velocidade", label: "Velocidade" },
  { key: "todos", label: "Todos" },
];

type Props = {
  evento: EventoDaTurma;
  palette: ProfileShellPalette;
  /** Convite enviado: o rank recarrega. */
  onEnviado: () => void;
};

/**
 * Duelar dentro do evento (#154, fase 4). O banco sugere os colegas inscritos de desempenho mais
 * próximo (`evento_sugerir_adversarios`, só nomes) e o aluno escolhe um deles; fora da sugestão, a
 * RPC recusa. Depois do convite o duelo é o da Arena do Social: o colega aceita e os dois jogam lá.
 *
 * Nada aqui custa ponto: no evento quem perde recebe a participação, e o duelo não entra no XP, na
 * nota nem no Elo. Por isso o bloco fica fechado até o aluno pedir.
 */
export function DueloNoEvento({ evento, palette, onEnviado }: Props) {
  const [aberto, setAberto] = useState(false);
  const [sugeridos, setSugeridos] = useState<SugeridoNoEvento[] | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDaArena>("precisao");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    setSugeridos(null);
    setEscolhido(null);
    setErro(null);
    try {
      setSugeridos(await sugerirAdversariosNoEvento(evento.id));
    } catch (e) {
      setSugeridos([]);
      setErro(mensagemDaArena(e));
    }
  }

  function abrir() {
    setAberto(true);
    setAviso(null);
    void carregar();
  }

  async function desafiar() {
    if (!escolhido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await duelarNoEvento(evento.id, escolhido, modo, QUANTIDADE_DA_ARENA);
      setAberto(false);
      setAviso("Convite enviado. O duelo aparece na Arena do Social e vale quando o colega aceitar.");
      onEnviado();
    } catch (e) {
      setErro(mensagemDaArena(e));
    } finally {
      setEnviando(false);
    }
  }

  const chip = (ativo: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: ativo }}
      onPress={onPress}
      style={[s.chip, { borderColor: ativo ? palette.accent : palette.border, backgroundColor: ativo ? palette.accent : "transparent" }]}
    >
      <Text style={[s.chipTexto, { color: ativo ? palette.background : palette.text }]}>{label}</Text>
    </Pressable>
  );

  if (!aberto)
    return (
      <View style={s.fechado}>
        {aviso ? (
          <Text accessibilityRole="alert" style={[s.texto, { color: palette.textMuted }]}>
            {aviso}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={abrir}
          style={[s.botao, s.botaoSecundario, { borderColor: palette.accent, backgroundColor: palette.surface }]}
        >
          <MaterialCommunityIcons name="sword-cross" size={18} color={palette.accent} />
          <Text style={[s.botaoTexto, { color: palette.accent }]}>Duelar neste evento</Text>
        </Pressable>
      </View>
    );

  return (
    <View accessibilityLabel="Duelo no evento" style={[s.caixa, { borderColor: palette.border, backgroundColor: `${palette.background}8c` }]}>
      <View style={s.topo}>
        <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>
          Duelo 1x1 no evento
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar o duelo" hitSlop={10} onPress={() => setAberto(false)}>
          <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
        </Pressable>
      </View>
      <Text style={[s.texto, { color: palette.textMuted }]}>
        Os adversários são colegas do rank com desempenho parecido com o seu. Quem perde não perde ponto, e o duelo não muda nota nem XP.
      </Text>

      <Text style={[s.rotulo, { color: palette.textMuted }]}>Adversário</Text>
      {sugeridos === null ? (
        <ActivityIndicator color={palette.textMuted} accessibilityLabel="Carregando os adversários" />
      ) : sugeridos.length ? (
        <View accessibilityRole="radiogroup" style={s.linha}>
          {sugeridos.map((p) => chip(escolhido === p.alunoId, p.nome, () => setEscolhido(p.alunoId), p.alunoId))}
        </View>
      ) : !erro ? (
        <Text style={[s.texto, { color: palette.textMuted }]}>Ninguém mais entrou no rank ainda. Quando alguém entrar, aparece aqui.</Text>
      ) : null}

      <Text style={[s.rotulo, { color: palette.textMuted }]}>Regra · {QUANTIDADE_DA_ARENA} questões · uma tentativa cada</Text>
      <View accessibilityRole="radiogroup" style={s.linha}>
        {MODOS.map((m) => chip(modo === m.key, m.label, () => setModo(m.key), m.key))}
      </View>

      {erro ? (
        <Text accessibilityRole="alert" style={[s.texto, { color: palette.text }]}>
          {erro}
        </Text>
      ) : null}

      <View style={s.acoes}>
        <Pressable accessibilityRole="button" onPress={() => void carregar()} style={s.link}>
          <Text style={[s.linkTexto, { color: palette.accent }]}>Atualizar lista</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !escolhido || enviando, busy: enviando }}
          disabled={!escolhido || enviando}
          onPress={() => void desafiar()}
          style={[s.botao, { backgroundColor: palette.accent, opacity: !escolhido || enviando ? 0.45 : 1 }]}
        >
          {enviando ? <ActivityIndicator color={palette.background} /> : <Text style={[s.botaoTexto, { color: palette.background }]}>Desafiar</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fechado: { gap: 8 },
  caixa: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 10 },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 16 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  acoes: { flexDirection: "row", alignItems: "center", gap: 10 },
  link: { minHeight: 44, justifyContent: "center", flex: 1 },
  linkTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  botao: {
    minHeight: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  botaoSecundario: { borderWidth: 1 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
});
