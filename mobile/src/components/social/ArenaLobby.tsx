import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import type { Guild } from "@/services/social/guildModel";
import type { SocialPerson } from "@/services/social/socialModel";
import {
  argumentosDeCriacao,
  mensagemDaArena,
  sortearParaArena,
  validarNovoDesafio,
  type FormatoDaArena,
  type ModoDaArena,
  type NovoDesafio,
} from "@/services/social/arenaModel";
import { criarDesafioNaArena } from "@/services/social/guildService";
import { avisarFalha } from "@/services/saude/medicao";

type Icone = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const FORMATOS: { key: FormatoDaArena; label: string; texto: string; icone: Icone }[] = [
  { key: "solo", label: "Duelo 1x1", texto: "Você contra um colega.", icone: "sword-cross" },
  { key: "dupla", label: "Dupla 2x2", texto: "Você e uma dupla contra outra dupla.", icone: "account-multiple" },
  { key: "guilda", label: "Guilda x guilda", texto: "Sua guilda contra outra guilda.", icone: "shield-half-full" },
];
const MODOS: { key: ModoDaArena; label: string }[] = [
  { key: "precisao", label: "Precisão" },
  { key: "velocidade", label: "Velocidade" },
  { key: "todos", label: "Todos" },
];

export const QUANTIDADE_DA_ARENA = 5;

/** Para abrir o lobby já num passo: o "Desafiar" do cartão do amigo chega com o duelo e ele escolhido. */
export type InicioDoLobby = { formato: FormatoDaArena; adversarios: string[] } | null;

type Props = {
  visible: boolean;
  inicio: InicioDoLobby;
  classeId: number;
  meuId: string | null;
  colegas: SocialPerson[];
  guilds: Guild[];
  palette: ProfileShellPalette;
  onClose: () => void;
  /** Convite enviado: a seção recarrega as partidas e mostra o aviso. */
  onCriado: (aviso: string) => void;
};

/**
 * O caminho até a partida, como no lobby dos jogos de batalha (Free Fire): entrar na arena,
 * escolher o modo e, no passo seguinte, o adversário, escolhido na mão ou na busca aleatória,
 * que vale para os três modos. "Começar" manda o mesmo convite de antes (`arena_desafio_criar`).
 */
export function ArenaLobby({ visible, inicio, classeId, meuId, colegas, guilds, palette, onClose, onCriado }: Props) {
  // Na tela larga a tela cheia esticava cada modo por 1.500 px: lá o lobby é uma janela no meio.
  const desktop = useDesktopWeb();
  const minhaGuilda = guilds.find((g) => g.souMembro) ?? null;
  const rivais = useMemo(() => guilds.filter((g) => !g.souMembro && g.membrosAtivos > 0), [guilds]);
  const vazio: NovoDesafio = { formato: "solo", aliado: null, adversarios: [], guildaId: minhaGuilda?.id ?? null, guildaRival: null };
  const [passo, setPasso] = useState<"modo" | "adversario">("modo");
  const [novo, setNovo] = useState<NovoDesafio>(vazio);
  const [modo, setModo] = useState<ModoDaArena>("precisao");
  const [sorteado, setSorteado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErro(null);
    setSorteado(false);
    if (inicio) {
      setNovo({ ...vazio, formato: inicio.formato, adversarios: inicio.adversarios });
      setPasso("adversario");
    } else {
      setNovo(vazio);
      setPasso("modo");
    }
    // `vazio` muda com a guilda; abrir de novo é o que reinicia o lobby.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inicio]);

  const formato = FORMATOS.find((f) => f.key === novo.formato) ?? FORMATOS[0];
  const problema = validarNovoDesafio(novo, meuId);
  const nome = (id: string | null) => {
    const p = colegas.find((c) => c.alunoId === id);
    return p ? p.apelido ?? p.nome.split(" ")[0] : "";
  };

  function escolherFormato(f: FormatoDaArena) {
    setNovo({ ...vazio, formato: f });
    setSorteado(false);
    setErro(null);
    setPasso("adversario");
  }

  function buscaAleatoria() {
    // Sorteia de novo do zero, menos a dupla que o aluno escolheu na mão.
    const base = { ...novo, adversarios: [], guildaRival: null, aliado: sorteado ? null : novo.aliado };
    setNovo(sortearParaArena(base, colegas, rivais));
    setSorteado(true);
    setErro(null);
  }

  function alternarAdversario(id: string) {
    const max = novo.formato === "dupla" ? 2 : 1;
    const atual = novo.adversarios;
    const adversarios = atual.includes(id) ? atual.filter((x) => x !== id) : max === 1 ? [id] : [...atual, id].slice(-max);
    setNovo({ ...novo, adversarios, aliado: novo.aliado === id ? null : novo.aliado });
    setSorteado(false);
  }

  function alternarAliado(id: string) {
    setNovo({ ...novo, aliado: novo.aliado === id ? null : id, adversarios: novo.adversarios.filter((x) => x !== id) });
    setSorteado(false);
  }

  async function comecar() {
    if (problema || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await criarDesafioNaArena(argumentosDeCriacao(classeId, novo, modo, QUANTIDADE_DA_ARENA));
      onCriado("Desafio enviado. O convite fica aberto por cerca de 24 h; vale quando o adversário aceitar.");
      onClose();
    } catch (error) {
      avisarFalha("arena/criar", "[Arena] Falha ao criar o desafio:", error);
      setErro(mensagemDaArena(error));
    } finally {
      setEnviando(false);
    }
  }

  const chip = (ativo: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={onPress}
      style={[s.chip, { borderColor: ativo ? palette.accent : palette.border, backgroundColor: ativo ? palette.accent : "transparent" }]}>
      <Text style={[s.chipTexto, { color: ativo ? palette.background : palette.text }]}>{label}</Text>
    </Pressable>
  );

  const versus = novo.formato === "guilda"
    ? (minhaGuilda && novo.guildaRival ? `${minhaGuilda.nome} x ${rivais.find((g) => g.id === novo.guildaRival)?.nome ?? ""}` : null)
    : novo.adversarios.length
      ? `${novo.formato === "dupla" ? `Você e ${nome(novo.aliado) || "?"}` : "Você"} x ${novo.adversarios.map(nome).join(" e ")}`
      : null;

  return (
    <Modal visible={visible} animationType={desktop ? "fade" : "slide"} transparent onRequestClose={onClose}>
      <View style={desktop ? s.fundoLargo : s.fundo}>
      {desktop ? <Pressable accessibilityLabel="Sair da arena" onPress={onClose} style={StyleSheet.absoluteFill} /> : null}
      <View style={[desktop ? [s.janela, { borderColor: palette.borderStrong }] : s.fundo, { backgroundColor: palette.background }]}>
        <View style={[s.topo, { borderBottomColor: palette.border }]}>
          {passo === "adversario" ? (
            <Pressable onPress={() => setPasso("modo")} accessibilityRole="button" accessibilityLabel="Voltar para os modos" hitSlop={10} style={s.icone}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.text} />
            </Pressable>
          ) : <View style={s.icone} />}
          <Text accessibilityRole="header" style={[s.tituloTopo, { color: palette.text }]}>{passo === "modo" ? "Escolha o modo" : formato.label}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Sair da arena" hitSlop={10} style={s.icone}>
            <MaterialCommunityIcons name="close" size={24} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.corpo}>
          {passo === "modo" ? (
            FORMATOS.map((f) => {
              const semGuilda = f.key === "guilda" && !minhaGuilda;
              return (
                <Pressable key={f.key} disabled={semGuilda} onPress={() => escolherFormato(f.key)} accessibilityRole="button"
                  accessibilityLabel={`${f.label}. ${semGuilda ? "Entre numa guilda para jogar." : f.texto}`}
                  style={[s.modo, { backgroundColor: palette.surface, borderColor: semGuilda ? palette.border : palette.accent, opacity: semGuilda ? 0.55 : 1 }]}>
                  <View style={[s.modoIcone, { backgroundColor: palette.accentSoft }]}>
                    <MaterialCommunityIcons name={f.icone} size={30} color={palette.accent} />
                  </View>
                  <View style={s.modoTexto}>
                    <Text style={[s.modoTitulo, { color: palette.text }]}>{f.label}</Text>
                    <Text style={[s.modoDescricao, { color: palette.textMuted }]}>{semGuilda ? "Entre numa guilda para jogar." : f.texto}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={26} color={palette.textMuted} />
                </Pressable>
              );
            })
          ) : (
            <>
              <Text style={[s.rotulo, { color: palette.textMuted }]}>Regra · {QUANTIDADE_DA_ARENA} questões · uma tentativa cada</Text>
              <View style={s.linha}>{MODOS.map((m) => chip(modo === m.key, m.label, () => setModo(m.key), m.key))}</View>

              <Text style={[s.rotulo, { color: palette.textMuted }]}>{novo.formato === "guilda" ? "Guilda rival" : novo.formato === "dupla" ? "Dupla e adversários" : "Adversário"}</Text>
              <Pressable onPress={buscaAleatoria} accessibilityRole="button" style={[s.aleatorio, { borderColor: palette.accent, backgroundColor: palette.accentMuted }]}>
                <MaterialCommunityIcons name="dice-multiple-outline" size={26} color={palette.accent} />
                <View style={s.modoTexto}>
                  <Text style={[s.aleatorioTitulo, { color: palette.accent }]}>{sorteado ? "Sortear de novo" : "Busca aleatória"}</Text>
                  <Text style={[s.modoDescricao, { color: palette.textMuted }]}>
                    {novo.formato === "guilda" ? "Uma guilda da turma." : "Colegas da turma, quem está online primeiro."}
                  </Text>
                </View>
              </Pressable>

              <Text style={[s.ou, { color: palette.textMuted }]}>ou escolha</Text>
              {novo.formato === "guilda" ? (
                <View style={s.linha}>
                  {rivais.length
                    ? rivais.map((g) => chip(novo.guildaRival === g.id, g.nome, () => { setNovo({ ...novo, guildaRival: novo.guildaRival === g.id ? null : g.id }); setSorteado(false); }, g.id))
                    : <Text style={{ color: palette.textMuted }}>Nenhuma outra guilda com membros.</Text>}
                </View>
              ) : (
                <>
                  {novo.formato === "dupla" ? (
                    <>
                      <Text style={[s.rotulo, { color: palette.textMuted }]}>Sua dupla</Text>
                      <View style={s.linha}>{colegas.map((p) => chip(novo.aliado === p.alunoId, p.apelido ?? p.nome, () => alternarAliado(p.alunoId), `a-${p.alunoId}`))}</View>
                      <Text style={[s.rotulo, { color: palette.textMuted }]}>Adversários (2)</Text>
                    </>
                  ) : null}
                  <View style={s.linha}>
                    {colegas.length
                      ? colegas.map((p) => chip(novo.adversarios.includes(p.alunoId), `${p.online ? "● " : ""}${p.apelido ?? p.nome}`, () => alternarAdversario(p.alunoId), `x-${p.alunoId}`))
                      : <Text style={{ color: palette.textMuted }}>Nenhum colega disponível.</Text>}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>

        {passo === "adversario" ? (
          <View style={[s.rodape, { borderTopColor: palette.border }]}>
            {versus ? <Text numberOfLines={2} style={[s.versus, { color: palette.text }]}>{versus}</Text> : null}
            {erro ?? problema ? <Text style={[s.dica, { color: erro ? palette.text : palette.textMuted }]}>{erro ?? problema}</Text> : null}
            <Pressable disabled={Boolean(problema) || enviando} onPress={() => void comecar()} accessibilityRole="button"
              style={[s.comecar, { backgroundColor: palette.accent, opacity: problema || enviando ? 0.4 : 1 }]}>
              {enviando ? <ActivityIndicator color={palette.background} /> : (
                <>
                  <MaterialCommunityIcons name="sword" size={20} color={palette.background} />
                  <Text style={[s.comecarTexto, { color: palette.background }]}>Começar</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1 },
  fundoLargo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "rgba(0,0,0,0.5)" },
  // Altura definida: sem ela o ScrollView do corpo, que mede pelo pai, fecha em 0.
  janela: { width: 560, maxWidth: "100%", height: "80%", maxHeight: 640, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  topo: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1 },
  icone: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  tituloTopo: { flex: 1, textAlign: "center", fontFamily: FontFamily.inikaBold, fontSize: 20 },
  corpo: { padding: 20, gap: 12 },
  modo: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 18, padding: 16, minHeight: 88 },
  modoIcone: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modoTexto: { flex: 1, gap: 3 },
  modoTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 18 },
  modoDescricao: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 13, marginTop: 4 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  chipTexto: { fontSize: 14 },
  aleatorio: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 14, minHeight: 64 },
  aleatorioTitulo: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "800" },
  ou: { textAlign: "center", fontFamily: FontFamily.interMedium, fontSize: 12 },
  rodape: { borderTopWidth: 1, padding: 16, gap: 8 },
  versus: { fontFamily: FontFamily.inikaBold, fontSize: 16, textAlign: "center" },
  dica: { fontSize: 13, textAlign: "center" },
  comecar: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  comecarTexto: { fontFamily: FontFamily.interMedium, fontSize: 17, fontWeight: "800" },
});
