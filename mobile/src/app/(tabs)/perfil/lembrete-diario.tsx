import { HallBackground } from "@/components/HallTheme";
import { EsqueletoBloco, EsqueletoGrupo } from "@/components/carregamento/Esqueleto";
import { Interruptor } from "@/components/perfil/Interruptor";
import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  listarRotinas,
  meuSilencio,
  motivoDaRecusa,
  RotinaNotificacao,
  salvarRotina,
  salvarSilencio,
  SilencioDoAluno,
} from "@/services/notificacoesDb";
import { agendarRotinasLocais, resolverTimezone } from "@/services/pushNotifications";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { ApoioConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { useAcaoDeMoldura } from "@/hooks/useMolduras";

// Mesmo `tipo` que o login cria automaticamente para todo aluno (ver
// `notificacoes_registrar_login` / migracao 20260826_04) — salvar com esse
// `tipo` atualiza a rotina existente (upsert por `aluno_id, tipo`) em vez de
// criar uma nova.
const TIPO_REVISAO_DIARIA = "revisao_diaria";

// Horarios tipicos de estudo, em vez de um seletor livre - mais rapido de
// escolher e nao depende de nenhuma biblioteca de time picker (que nem
// funcionaria igual na web).
const HORARIOS_SUGERIDOS = [7, 8, 12, 14, 18, 19, 20, 21];
const MAX_HORARIOS = 4;

// Dias ISO, como o banco guarda (1 = segunda).
const DIAS = [
  { iso: 1, curto: "S", nome: "segunda" },
  { iso: 2, curto: "T", nome: "terça" },
  { iso: 3, curto: "Q", nome: "quarta" },
  { iso: 4, curto: "Q", nome: "quinta" },
  { iso: 5, curto: "S", nome: "sexta" },
  { iso: 6, curto: "S", nome: "sábado" },
  { iso: 7, curto: "D", nome: "domingo" },
];
const TODOS_OS_DIAS = DIAS.map((d) => d.iso);

function formatarHora(hora: number, minuto: number) {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function formatarMinutos(total: number) {
  return formatarHora(Math.floor(total / 60), total % 60);
}

function resumoDosDias(dias: number[]) {
  if (dias.length === 7) return "todo dia";
  if (dias.length === 5 && dias.every((d) => d <= 5)) return "de segunda a sexta";
  if (dias.length === 2 && dias.includes(6) && dias.includes(7)) return "no fim de semana";
  return DIAS.filter((d) => dias.includes(d.iso)).map((d) => d.nome).join(", ");
}

function duracaoDoSilencio(inicio: number, fim: number) {
  return (fim - inicio + 24) % 24;
}

export default function LembreteDiarioScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const { showDialog } = useDialog();
  const palette = useMemo(
    () =>
      getProfileShellPalette(
        perfilVisualDoAluno(usuario),
      ),
    [usuario],
  );

  const [carregando, setCarregando] = useState(true);
  const [rotina, setRotina] = useState<RotinaNotificacao | null>(null);
  const [silencio, setSilencio] = useState<SilencioDoAluno | null>(null);
  // Rascunho do silêncio: cada toque nos botões não vira uma chamada ao banco.
  const [rascunho, setRascunho] = useState<{ inicio: number; fim: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const acaoDeMoldura = useAcaoDeMoldura();

  useEffect(() => {
    let ativo = true;
    void Promise.all([listarRotinas(), meuSilencio()]).then(([rotinas, meu]) => {
      if (!ativo) return;
      setRotina(rotinas.find((r) => r.tipo === TIPO_REVISAO_DIARIA) ?? rotinas.find((r) => r.gatilho === "horario") ?? null);
      setSilencio(meu);
      setRascunho(meu ? { inicio: meu.inicio, fim: meu.fim } : null);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const ativado = rotina?.ativo ?? true;
  const horarios = useMemo(
    () =>
      rotina?.horarios && rotina.horarios.length > 0
        ? rotina.horarios
        : [(rotina?.hora_local ?? 19) * 60 + (rotina?.minuto_local ?? 0)],
    [rotina],
  );
  const dias = rotina?.dias_semana && rotina.dias_semana.length > 0 ? rotina.dias_semana : TODOS_OS_DIAS;

  const recusado = (codigo: string | null) =>
    showDialog({ title: "Não foi possível salvar", description: motivoDaRecusa(codigo), tone: "warning" });

  /** O aparelho dispara sozinho: depois de mudar no banco, reagenda já, não só no próximo login. */
  const reagendar = async () => {
    await agendarRotinasLocais(await listarRotinas());
  };

  const persistir = async (mudanca: { ativo?: boolean; horarios?: number[]; dias?: number[] }) => {
    if (salvando) return;
    const proximoAtivo = mudanca.ativo ?? ativado;
    const proximos = [...(mudanca.horarios ?? horarios)].sort((a, b) => a - b);
    const proximosDias = [...(mudanca.dias ?? dias)].sort((a, b) => a - b);

    setSalvando(true);
    try {
      const { data, erro } = await salvarRotina({
        tipo: TIPO_REVISAO_DIARIA,
        gatilho: "horario",
        recorrencia: "diaria",
        horaLocal: Math.floor(proximos[0] / 60),
        minutoLocal: proximos[0] % 60,
        horarios: proximos,
        diasSemana: proximosDias,
        timezone: resolverTimezone(),
        ativo: proximoAtivo,
      });

      if (!data) {
        recusado(erro);
        return;
      }
      if (proximoAtivo) acaoDeMoldura("definir_lembrete");

      setRotina((prev) => ({
        id: data.id,
        tipo: TIPO_REVISAO_DIARIA,
        recorrencia: "diaria",
        gatilho: "horario",
        titulo: prev?.titulo ?? null,
        corpo: prev?.corpo ?? null,
        hora_local: Math.floor(proximos[0] / 60),
        minuto_local: proximos[0] % 60,
        timezone: resolverTimezone(),
        prioridade: prev?.prioridade ?? 0,
        contexto: prev?.contexto ?? null,
        ativo: proximoAtivo,
        proxima_execucao: data.proxima_execucao,
        dias_semana: data.dias_semana,
        horarios: data.horarios,
      }));
      await reagendar();
    } finally {
      setSalvando(false);
    }
  };

  const alternarHorario = (minutos: number) => {
    const escolhido = horarios.includes(minutos);
    if (escolhido) {
      if (horarios.length === 1) return; // pelo menos um horário: para não avisar, desligue
      void persistir({ horarios: horarios.filter((h) => h !== minutos) });
      return;
    }
    if (horarios.length >= MAX_HORARIOS) {
      recusado("horarios_demais");
      return;
    }
    void persistir({ horarios: [...horarios, minutos] });
  };

  const alternarDia = (iso: number) => {
    if (dias.includes(iso)) {
      if (dias.length === 1) return;
      void persistir({ dias: dias.filter((d) => d !== iso) });
      return;
    }
    void persistir({ dias: [...dias, iso] });
  };

  const gravarSilencio = async (valor: { inicio: number; fim: number } | null) => {
    if (salvando) return;
    setSalvando(true);
    try {
      const { data, erro } = await salvarSilencio(valor?.inicio ?? null, valor?.fim ?? null);
      if (!data) {
        recusado(erro);
        return;
      }
      setSilencio(data);
      setRascunho({ inicio: data.inicio, fim: data.fim });
    } finally {
      setSalvando(false);
    }
  };

  const mexerNoRascunho = (campo: "inicio" | "fim", passo: number) =>
    setRascunho((r) => (r ? { ...r, [campo]: (r[campo] + passo + 24) % 24 } : r));

  const rascunhoMudou = !!silencio && !!rascunho && (rascunho.inicio !== silencio.inicio || rascunho.fim !== silencio.fim);
  const duracaoRascunho = rascunho ? duracaoDoSilencio(rascunho.inicio, rascunho.fim) : 0;
  const rascunhoValido =
    !!silencio && duracaoRascunho >= silencio.duracao_min_h && duracaoRascunho <= silencio.duracao_max_h;

  const chip = (selecionado: boolean) => [
    styles.horaChip,
    {
      backgroundColor: selecionado ? palette.accent : palette.surfaceElevated,
      borderColor: selecionado ? palette.borderStrong : palette.border,
    },
  ];

  const passoSilencio = (campo: "inicio" | "fim", rotulo: string) => (
    <View style={styles.passoLinha}>
      <Text style={[styles.passoRotulo, { color: palette.textMuted }]}>{rotulo}</Text>
      <TouchableOpacity
        style={[styles.passoBotao, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}
        onPress={() => mexerNoRascunho(campo, -1)}
        disabled={salvando}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: uma hora antes`}
      >
        <MaterialCommunityIcons name="minus" size={16} color={palette.text} />
      </TouchableOpacity>
      <Text style={[styles.passoValor, { color: palette.text }]}>
        {rascunho ? formatarHora(rascunho[campo], 0) : "--:--"}
      </Text>
      <TouchableOpacity
        style={[styles.passoBotao, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}
        onPress={() => mexerNoRascunho(campo, 1)}
        disabled={salvando}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: uma hora depois`}
      >
        <MaterialCommunityIcons name="plus" size={16} color={palette.text} />
      </TouchableOpacity>
    </View>
  );

  const resumoHorarios = horarios.map(formatarMinutos).join(", ");

  const controles = (
    <>
        {carregando ? (
          // No formato do que vem: o interruptor e os horários (o lembrete nasce ligado).
          <EsqueletoGrupo rotulo="Carregando seus lembretes" superficie={palette.surfaceElevated} style={styles.esqueleto}>
            <View style={[styles.toggleRow, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
              <View style={styles.toggleLeft}>
                <EsqueletoBloco largura={38} altura={38} raio={10} />
                <View style={[styles.toggleTextWrap, styles.esqueletoTexto]}>
                  <EsqueletoBloco largura="52%" altura={15} />
                  <EsqueletoBloco largura="70%" altura={11} />
                </View>
              </View>
              <EsqueletoBloco largura={46} altura={26} raio={13} />
            </View>
            <View style={styles.horariosWrap}>
              <EsqueletoBloco largura={64} altura={12} />
              <View style={styles.horariosGrid}>
                {HORARIOS_SUGERIDOS.map((hora) => (
                  <EsqueletoBloco key={hora} largura={62} altura={40} raio={999} />
                ))}
              </View>
            </View>
          </EsqueletoGrupo>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.toggleRow,
                { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
              ]}
              activeOpacity={0.85}
              onPress={() => void persistir({ ativo: !ativado })}
              disabled={salvando}
              accessibilityRole="switch"
              accessibilityState={{ checked: ativado, disabled: salvando }}
              accessibilityLabel="Lembrete de estudo"
            >
              <View style={styles.toggleLeft}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: ativado ? palette.accentMuted : palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="bell-ring-outline"
                    size={18}
                    color={ativado ? palette.accent : palette.textSubtle}
                  />
                </View>
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.toggleTitle, { color: palette.text }]}>
                    Lembrete de estudo
                  </Text>
                  <Text style={[styles.toggleDescription, { color: palette.textMuted }]}>
                    {ativado ? `Avisa ${resumoDosDias(dias)} às ${resumoHorarios}` : "Desativado"}
                  </Text>
                </View>
              </View>
              <Interruptor ligado={ativado} salvando={salvando} palette={palette} />
            </TouchableOpacity>

            {ativado ? (
              <View
                style={[
                  styles.horariosWrap,
                  embutido && [styles.cartaoHorarios, { backgroundColor: palette.surface, borderColor: palette.border }],
                ]}
              >
                <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Dias</Text>
                <View style={styles.horariosGrid}>
                  {DIAS.map((dia) => {
                    const selecionado = dias.includes(dia.iso);
                    return (
                      <TouchableOpacity
                        key={dia.iso}
                        style={[chip(selecionado), styles.diaChip]}
                        onPress={() => alternarDia(dia.iso)}
                        disabled={salvando}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selecionado, disabled: salvando }}
                        accessibilityLabel={dia.nome}
                      >
                        <Text style={[styles.horaChipText, { color: selecionado ? "#fff" : palette.text }]}>
                          {dia.curto}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
                  Horários (até {MAX_HORARIOS}, com 4 h entre eles)
                </Text>
                <View style={styles.horariosGrid}>
                  {HORARIOS_SUGERIDOS.map((hora) => {
                    const minutos = hora * 60;
                    const selecionado = horarios.includes(minutos);
                    return (
                      <TouchableOpacity
                        key={hora}
                        style={chip(selecionado)}
                        onPress={() => alternarHorario(minutos)}
                        disabled={salvando}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selecionado, disabled: salvando }}
                        accessibilityLabel={`${hora} horas`}
                      >
                        <Text style={[styles.horaChipText, { color: selecionado ? "#fff" : palette.text }]}>
                          {formatarHora(hora, 0)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {silencio && rascunho ? (
              <View
                style={[
                  styles.horariosWrap,
                  embutido && [styles.cartaoHorarios, { backgroundColor: palette.surface, borderColor: palette.border }],
                ]}
              >
                <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Silêncio</Text>
                <Text style={[styles.toggleDescription, { color: palette.textMuted }]}>
                  Nesse período nenhum aviso toca: o que chegar espera o fim do silêncio. De {silencio.duracao_min_h} a{" "}
                  {silencio.duracao_max_h} horas{silencio.proprio ? "" : " (agora vale o padrão)"}.
                </Text>
                {passoSilencio("inicio", "Começa")}
                {passoSilencio("fim", "Termina")}
                <Text style={[styles.toggleDescription, { color: rascunhoValido ? palette.textMuted : palette.text }]}>
                  {duracaoRascunho} h de silêncio
                </Text>
                <View style={styles.horariosGrid}>
                  {rascunhoMudou ? (
                    <TouchableOpacity
                      style={chip(true)}
                      onPress={() => (rascunhoValido ? void gravarSilencio(rascunho) : recusado("silencio_duracao"))}
                      disabled={salvando}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.horaChipText, { color: "#fff" }]}>Salvar silêncio</Text>
                    </TouchableOpacity>
                  ) : null}
                  {silencio.proprio ? (
                    <TouchableOpacity
                      style={chip(false)}
                      onPress={() => void gravarSilencio(null)}
                      disabled={salvando}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.horaChipText, { color: palette.text }]}>
                        Voltar ao padrão ({formatarHora(silencio.padrao_inicio, 0)} às {formatarHora(silencio.padrao_fim, 0)})
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.toggleRow, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
              onPress={() => router.push("/(tabs)/perfil/modo-foco")}
              accessibilityRole="link"
              accessibilityLabel="Avisos silenciados e modo foco"
            >
              <View style={styles.toggleLeft}>
                <MaterialCommunityIcons name="bell-off-outline" size={18} color={palette.textMuted} />
                <Text style={[styles.toggleDescription, { color: palette.text }]}>
                  Avisos silenciados e modo foco
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          </>
        )}
    </>
  );

  // Embutida nas Configurações da web em tela larga (#346, protótipo v4): os controles à esquerda, como o aviso chega ao lado.
  if (embutido) {
    return (
      <DuasColunasConfig
        apoio={
          <ApoioConfig titulo="Como chega" palette={palette}>
            <TextoApoio palette={palette}>
              Com o app aberto no navegador, o aviso aparece como notificação; ele também fica em Notificações, como
              revisão diária. Até quatro horários por dia, nos dias que você escolher.
            </TextoApoio>
          </ApoioConfig>
        }
      >
        {controles}
      </DuasColunasConfig>
    );
  }

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {embutido ? null : (
          <Text style={[styles.title, { color: palette.text }]}>
            Lembretes e silêncio
          </Text>
        )}
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          Escolha os dias e os horários em que o TrailUp te avisa para continuar a
          trilha, e quando ele fica quieto. Funciona mesmo com o app fechado
          {Platform.OS === "web" ? " (no navegador, só quando o app está aberto)" : ""}.
        </Text>

        {controles}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cartaoHorarios: { borderRadius: 14, borderWidth: 1, padding: 18 },
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: FontFamily.inikaBold,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.interMedium,
  },
  toggleRow: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 16,
    fontFamily: FontFamily.inikaBold,
  },
  toggleDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FontFamily.interMedium,
  },
  horariosWrap: {
    gap: 10,
  },
  esqueleto: { gap: 16 },
  esqueletoTexto: { gap: 8 },
  sectionLabel: {
    fontSize: 13,
    fontFamily: FontFamily.inikaBold,
    textTransform: "uppercase",
  },
  horariosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  horaChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  diaChip: { paddingHorizontal: 0, width: 40, alignItems: "center" },
  passoLinha: { flexDirection: "row", alignItems: "center", gap: 10 },
  passoRotulo: { width: 70, fontSize: 13, fontFamily: FontFamily.interMedium },
  passoBotao: { width: 34, height: 34, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  passoValor: { minWidth: 52, textAlign: "center", fontSize: 16, fontFamily: FontFamily.inikaBold },
  horaChipText: {
    fontSize: 14,
    fontFamily: FontFamily.inikaBold,
  },
});
