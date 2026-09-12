import { HallBackground } from "@/components/HallTheme";
import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  listarRotinas,
  RotinaNotificacao,
  salvarRotina,
} from "@/services/notificacoesDb";
import { resolverTimezone } from "@/services/pushNotifications";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Mesmo `tipo` que o login cria automaticamente para todo aluno (ver
// `notificacoes_registrar_login` / migracao 20260826_04) — salvar com esse
// `tipo` atualiza a rotina existente (upsert por `aluno_id, tipo`) em vez de
// criar uma nova.
const TIPO_REVISAO_DIARIA = "revisao_diaria";

// Horarios tipicos de estudo, em vez de um seletor livre - mais rapido de
// escolher e nao depende de nenhuma biblioteca de time picker (que nem
// funcionaria igual na web).
const HORARIOS_SUGERIDOS = [7, 8, 12, 18, 19, 20, 21, 22];

function formatarHora(hora: number, minuto: number) {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

export default function LembreteDiarioScreen() {
  const { usuario } = useUsuario();
  const { showDialog } = useDialog();
  const palette = useMemo(
    () =>
      getProfileShellPalette(
        usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null,
      ),
    [usuario?.perfilAtivo, usuario?.perfis],
  );

  const [carregando, setCarregando] = useState(true);
  const [rotina, setRotina] = useState<RotinaNotificacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void listarRotinas().then((rotinas) => {
      if (!ativo) return;
      setRotina(rotinas.find((r) => r.gatilho === "horario") ?? null);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const ativado = rotina?.ativo ?? true;
  const horaAtual = rotina?.hora_local ?? 19;
  const minutoAtual = rotina?.minuto_local ?? 0;

  const persistir = async (mudanca: {
    ativo?: boolean;
    horaLocal?: number;
  }) => {
    if (salvando) return;
    const proximoAtivo = mudanca.ativo ?? ativado;
    const proximaHora = mudanca.horaLocal ?? horaAtual;

    setSalvando(true);
    try {
      const resultado = await salvarRotina({
        tipo: TIPO_REVISAO_DIARIA,
        gatilho: "horario",
        recorrencia: "diaria",
        horaLocal: proximaHora,
        minutoLocal: minutoAtual,
        timezone: resolverTimezone(),
        ativo: proximoAtivo,
      });

      if (!resultado) {
        showDialog({
          title: "Não foi possível salvar",
          description: "Tente novamente em instantes.",
          tone: "warning",
        });
        return;
      }

      setRotina((prev) =>
        prev
          ? { ...prev, ativo: proximoAtivo, hora_local: proximaHora }
          : {
              id: resultado.id,
              tipo: TIPO_REVISAO_DIARIA,
              recorrencia: "diaria",
              gatilho: "horario",
              titulo: null,
              corpo: null,
              hora_local: proximaHora,
              minuto_local: minutoAtual,
              timezone: resolverTimezone(),
              prioridade: 0,
              contexto: null,
              ativo: proximoAtivo,
              proxima_execucao: resultado.proxima_execucao,
            },
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.title, { color: palette.text }]}>
          Lembrete diário
        </Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          Escolha o horário em que o TrailUp te avisa para continuar a
          trilha. Funciona mesmo com o app fechado
          {Platform.OS === "web" ? " (no navegador, só quando o app está aberto)" : ""}.
        </Text>

        {carregando ? (
          <ActivityIndicator color={palette.accent} style={{ marginTop: 24 }} />
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
              accessibilityLabel="Lembrete diário"
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
                    Lembrete diário
                  </Text>
                  <Text style={[styles.toggleDescription, { color: palette.textMuted }]}>
                    {ativado
                      ? `Avisa todo dia às ${formatarHora(horaAtual, minutoAtual)}`
                      : "Desativado"}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.stateChip,
                  {
                    backgroundColor: ativado ? palette.accent : palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stateChipText,
                    { color: ativado ? "#fff" : palette.textMuted },
                  ]}
                >
                  {salvando ? "..." : ativado ? "Ativo" : "Desativado"}
                </Text>
              </View>
            </TouchableOpacity>

            {ativado ? (
              <View style={styles.horariosWrap}>
                <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
                  Horário
                </Text>
                <View style={styles.horariosGrid}>
                  {HORARIOS_SUGERIDOS.map((hora) => {
                    const selecionado = hora === horaAtual;
                    return (
                      <TouchableOpacity
                        key={hora}
                        style={[
                          styles.horaChip,
                          {
                            backgroundColor: selecionado ? palette.accent : palette.surfaceElevated,
                            borderColor: selecionado ? palette.borderStrong : palette.border,
                          },
                        ]}
                        onPress={() => void persistir({ horaLocal: hora })}
                        disabled={salvando}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selecionado, disabled: salvando }}
                        accessibilityLabel={`${hora} horas`}
                      >
                        <Text
                          style={[
                            styles.horaChipText,
                            { color: selecionado ? "#fff" : palette.text },
                          ]}
                        >
                          {formatarHora(hora, 0)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  stateChip: {
    minWidth: 88,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  stateChipText: {
    fontSize: 12,
    fontFamily: FontFamily.inikaBold,
  },
  horariosWrap: {
    gap: 10,
  },
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
  horaChipText: {
    fontSize: 14,
    fontFamily: FontFamily.inikaBold,
  },
});
