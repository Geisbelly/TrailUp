import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import CardSemDados from "@/components/CardSemDados";
import { HallBackground } from "@/components/HallTheme";
import { JourneyHeading } from "@/components/JourneyHeading";
import { useDialog } from "@/context/DialogContext";
import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import type { Notificacao } from "@/models/Notificacoes";
import { FontFamily } from "@/styles/GlobalStyle";
import { agruparPorData } from "@/utils/gruposNotificacao";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";

type Filtro = "todas" | "nao_lidas" | "lidas";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "nao_lidas", rotulo: "Não lidas" },
  { id: "lidas", rotulo: "Lidas" },
];

const estaLida = (n: Notificacao) => n.read ?? n.status === "lida";
const dataDe = (n: Notificacao) => n.horario_envio ?? n.created_at;
const doisDigitos = (v: number) => String(v).padStart(2, "0");

function horaCurta(quando: string | null, agora: Date): string {
  const d = quando ? new Date(quando) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const hoje = d.toDateString() === agora.toDateString();
  return hoje ? `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}` : `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
}

function enviadaEm(quando: string | null): string {
  const d = quando ? new Date(quando) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `Enviada em ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} às ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/**
 * Notificações na web em tela larga (#346, protótipo v4 — revisão 03):
 * lista na largura toda, a notificação abre no próprio item (nada aberto ao
 * entrar), grupos Hoje / Esta semana / Anteriores e "Marcar todas como lidas"
 * na linha dos filtros. Mesmas ações do app: abrir marca como lida; "Marcar
 * como não lida" e "Excluir" (com confirmação) como na página da notificação.
 */
export function NotificacoesDesktop() {
  const { itens, marcarLida, marcarTodasLidas, deletar, reload } = useNotifications();
  const { showConfirm, showDialog } = useDialog();
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis],
  );
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [aberta, setAberta] = useState<number | null>(null);
  const [excluida, setExcluida] = useState(false);
  const alvoTour = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("notificacoes_lista", alvoTour), []);

  const agora = new Date();
  const naoLidas = itens.filter((n) => !estaLida(n)).length;
  const visiveis = itens.filter((n) =>
    filtro === "todas" ? true : filtro === "lidas" ? estaLida(n) : !estaLida(n),
  );
  const grupos = agruparPorData(visiveis, dataDe, agora);

  const alternar = (n: Notificacao) => {
    setExcluida(false);
    if (aberta === n.id) {
      setAberta(null);
      return;
    }
    setAberta(n.id);
    if (!estaLida(n)) void marcarLida(n.id);
  };

  const marcarNaoLida = async (n: Notificacao) => {
    try {
      await n.updateRead(false);
      setAberta(null);
      await reload();
    } catch {
      showDialog({ title: "Erro", description: "Não foi possível alterar o status.", tone: "error" });
    }
  };

  const excluir = (n: Notificacao) =>
    showConfirm({
      title: "Excluir notificação",
      description: "Tem certeza de que deseja excluir esta notificação?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      confirmVariant: "danger",
      onConfirm: async () => {
        try {
          await deletar(n.id);
          setAberta(null);
          setExcluida(true);
        } catch {
          showDialog({ title: "Erro", description: "Não foi possível excluir.", tone: "error" });
        }
      },
    });

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <JourneyHeading title="Notificações" eyebrow="CAIXA DE ENTRADA" section="notifications" palette={palette} />

      <View style={[s.filtros, { borderBottomColor: palette.border }]}>
        {FILTROS.map(({ id, rotulo }) => {
          const ativo = filtro === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativo }}
              onPress={() => setFiltro(id)}
              style={[s.pill, { borderColor: ativo ? palette.accent : palette.border, backgroundColor: ativo ? palette.accent : palette.accentMuted }]}
            >
              <Text style={[s.pillTexto, { color: ativo ? palette.background : palette.textMuted }]}>
                {rotulo}
                {id === "nao_lidas" && naoLidas > 0 ? ` · ${naoLidas}` : ""}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={naoLidas === 0}
          onPress={() => void marcarTodasLidas()}
          style={[s.marcarTodas, naoLidas === 0 && { opacity: 0.45 }]}
        >
          <MaterialCommunityIcons name="check-all" size={18} color={palette.accent} />
          <Text style={[s.marcarTodasTexto, { color: palette.accent }]}>Marcar todas como lidas</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.conteudo}>
        <View ref={alvoTour} collapsable={false}>
          {excluida ? (
            <View style={[s.aviso, { borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={palette.accent} />
              <Text style={[s.avisoTexto, { color: palette.text }]}>Notificação excluída.</Text>
            </View>
          ) : null}

          {grupos.length === 0 ? (
            <CardSemDados title="Sem notificações" description="Você ainda não tem notificações por aqui." accentColor={palette.accent} />
          ) : (
            grupos.map(({ grupo, itens: doGrupo }) => (
              <View key={grupo} style={s.grupo}>
                <Text style={[s.grupoTitulo, { color: palette.textSubtle }]}>{grupo.toUpperCase()}</Text>
                {doGrupo.map((n) => {
                  const lida = estaLida(n);
                  const expandida = aberta === n.id;
                  return (
                    <View
                      key={n.id}
                      style={[
                        s.item,
                        { borderColor: expandida ? palette.borderStrong : palette.border, backgroundColor: expandida ? palette.surfaceElevated : palette.surface },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: expandida }}
                        onPress={() => alternar(n)}
                        style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [s.linha, hovered && !expandida && { backgroundColor: palette.accentMuted }]}
                      >
                        <View style={[s.icone, { backgroundColor: palette.accentMuted }]}>
                          <MaterialCommunityIcons name={lida ? "email-open-outline" : "email-outline"} size={18} color={palette.accent} />
                        </View>
                        <View style={s.textos}>
                          {!lida ? <Text style={[s.nova, { color: palette.accent }]}>NOVA</Text> : null}
                          <Text style={[s.titulo, { color: palette.text, fontWeight: lida ? "500" : "700" }]} numberOfLines={1}>{n.titulo}</Text>
                          {!expandida ? <Text style={[s.previa, { color: palette.textMuted }]} numberOfLines={1}>{n.corpo}</Text> : null}
                        </View>
                        <Text style={[s.hora, { color: palette.textSubtle }]}>{horaCurta(dataDe(n), agora)}</Text>
                        <MaterialCommunityIcons name={expandida ? "chevron-up" : "chevron-down"} size={20} color={palette.textSubtle} />
                      </Pressable>

                      {expandida ? (
                        <View style={s.corpo}>
                          <Text style={[s.mensagem, { color: palette.text }]}>{n.corpo}</Text>
                          <View style={[s.pe, { borderTopColor: palette.border }]}>
                            <Text style={[s.peTexto, { color: palette.textSubtle }]}>{enviadaEm(dataDe(n))}</Text>
                            <Pressable accessibilityRole="button" onPress={() => void marcarNaoLida(n)} style={s.acao}>
                              <Text style={[s.acaoTexto, { color: palette.textMuted }]}>Marcar como não lida</Text>
                            </Pressable>
                            <Pressable accessibilityRole="button" onPress={() => excluir(n)} style={s.acao}>
                              <MaterialCommunityIcons name="trash-can-outline" size={15} color="#f0847c" />
                              <Text style={[s.acaoTexto, { color: "#f0847c" }]}>Excluir</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1 },
  filtros: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1 },
  pill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  marcarTodas: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  marcarTodasTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  conteudo: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  aviso: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  avisoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5 },
  grupo: { marginBottom: 20, gap: 8 },
  grupoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, letterSpacing: 1, fontWeight: "700", marginBottom: 2 },
  item: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  linha: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  nova: { fontFamily: FontFamily.interMedium, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 14.5 },
  previa: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  hora: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  corpo: { paddingHorizontal: 66, paddingBottom: 14, gap: 14 },
  mensagem: { fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 24.75 },
  pe: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 10, borderTopWidth: 1 },
  peTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 12 },
  acao: { flexDirection: "row", alignItems: "center", gap: 5 },
  acaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "600" },
});
