import { HallBackground } from "@/components/HallTheme";
import { EsqueletoBloco, EsqueletoGrupo } from "@/components/carregamento/Esqueleto";
import { useDialog } from "@/context/DialogContext";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { useUsuario } from "@/context/SessaoContext";
import { lembrarFoco } from "@/services/focoLocal";
import {
  encerrarFoco,
  EstadoFoco,
  iniciarFoco,
  listarSilenciados,
  meuFoco,
  silenciarTipo,
  TIPOS_SILENCIAVEIS,
} from "@/services/notificacoesDb";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { ApoioConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAcaoDeMoldura } from "@/hooks/useMolduras";

// Blocos de estudo comuns, em vez de um seletor livre (mesma ideia dos horários do lembrete).
const DURACOES_MIN = [25, 50, 90];

function formatarHora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function descreverFoco(foco: EstadoFoco | null) {
  if (!foco?.em_foco) return "Desligado";
  if (foco.origem === "aluno" && foco.ate) return `Ligado até ${formatarHora(foco.ate)}`;
  return "Ligado enquanto você estuda";
}

/**
 * Modo foco e avisos silenciados (#149). Sem tela de preferências com vinte chaves: o que
 * chega para cada aluno sai do perfil, e silenciar acontece na própria notificação. Aqui
 * só se liga o foco e se desfaz um silêncio.
 */
export default function ModoFocoScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const { showDialog } = useDialog();
  const palette = useMemo(() => getProfileShellPalette(perfilVisualDoAluno(usuario)), [usuario]);

  const [carregando, setCarregando] = useState(true);
  const [foco, setFoco] = useState<EstadoFoco | null>(null);
  const [silenciados, setSilenciados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const acaoDeMoldura = useAcaoDeMoldura();

  const aplicarFoco = useCallback((estado: EstadoFoco | null) => {
    setFoco(estado);
    lembrarFoco(estado);
  }, []);

  useEffect(() => {
    let ativo = true;
    void Promise.all([meuFoco(), listarSilenciados()]).then(([estado, tipos]) => {
      if (!ativo) return;
      aplicarFoco(estado);
      setSilenciados(tipos);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [aplicarFoco]);

  const falhou = () =>
    showDialog({ title: "Não foi possível salvar", description: "Tente novamente em instantes.", tone: "warning" });

  const ligar = async (minutos: number) => {
    if (salvando) return;
    setSalvando(true);
    try {
      const estado = await iniciarFoco(minutos);
      if (!estado) return falhou();
      aplicarFoco(estado);
      acaoDeMoldura("usar_modo_foco");
    } finally {
      setSalvando(false);
    }
  };

  const desligar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const estado = await encerrarFoco();
      if (!estado) return falhou();
      aplicarFoco(estado);
    } finally {
      setSalvando(false);
    }
  };

  const reativar = async (tipo: string) => {
    if (salvando) return;
    setSalvando(true);
    try {
      const r = await silenciarTipo({ tipo, silenciar: false });
      if (!r) return falhou();
      setSilenciados((prev) => prev.filter((t) => t !== tipo));
    } finally {
      setSalvando(false);
    }
  };

  const focoDoAluno = !!foco?.em_foco && foco.origem === "aluno";

  const controles = carregando ? (
    <EsqueletoGrupo rotulo="Carregando o modo foco" superficie={palette.surfaceElevated} style={styles.esqueleto}>
      <EsqueletoBloco largura="100%" altura={72} raio={16} />
      <View style={styles.chips}>
        {DURACOES_MIN.map((m) => (
          <EsqueletoBloco key={m} largura={78} altura={40} raio={999} />
        ))}
      </View>
      <EsqueletoBloco largura="100%" altura={56} raio={16} />
    </EsqueletoGrupo>
  ) : (
    <>
      <View style={[styles.cartao, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: foco?.em_foco ? palette.accentMuted : palette.surface, borderColor: palette.border },
          ]}
        >
          <MaterialCommunityIcons
            name="bell-sleep-outline"
            size={18}
            color={foco?.em_foco ? palette.accent : palette.textSubtle}
          />
        </View>
        <View style={styles.cartaoTexto}>
          <Text style={[styles.cartaoTitulo, { color: palette.text }]}>Modo foco</Text>
          <Text style={[styles.cartaoDescricao, { color: palette.textMuted }]}>{descreverFoco(foco)}</Text>
          {foco?.em_foco && foco.seguradas > 0 ? (
            <Text style={[styles.cartaoDescricao, { color: palette.textMuted }]}>
              {foco.seguradas === 1 ? "1 aviso esperando" : `${foco.seguradas} avisos esperando`}
            </Text>
          ) : null}
        </View>
      </View>

      {focoDoAluno ? (
        <TouchableOpacity
          style={[styles.botao, { backgroundColor: palette.accent, borderColor: palette.borderStrong }]}
          onPress={() => void desligar()}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityState={{ disabled: salvando }}
        >
          <Text style={[styles.botaoTexto, { color: "#fff" }]}>Encerrar foco</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.secao}>
          <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Ligar por</Text>
          <View style={styles.chips}>
            {DURACOES_MIN.map((minutos) => (
              <TouchableOpacity
                key={minutos}
                style={[styles.chip, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
                onPress={() => void ligar(minutos)}
                disabled={salvando}
                accessibilityRole="button"
                accessibilityLabel={`Ligar o modo foco por ${minutos} minutos`}
                accessibilityState={{ disabled: salvando }}
              >
                <Text style={[styles.chipTexto, { color: palette.text }]}>{minutos} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.secao}>
        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Avisos silenciados</Text>
        {silenciados.length === 0 ? (
          <Text style={[styles.vazio, { color: palette.textMuted }]}>
            Nenhum. Para silenciar um tipo de aviso, abra a notificação e toque em “Não quero avisos assim”.
          </Text>
        ) : (
          silenciados.map((tipo) => (
            <View
              key={tipo}
              style={[styles.linhaSilenciado, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
            >
              <Text style={[styles.linhaTexto, { color: palette.text }]}>{TIPOS_SILENCIAVEIS[tipo] ?? tipo}</Text>
              <TouchableOpacity
                onPress={() => void reativar(tipo)}
                disabled={salvando}
                accessibilityRole="button"
                accessibilityLabel={`Voltar a receber: ${TIPOS_SILENCIAVEIS[tipo] ?? tipo}`}
              >
                <Text style={[styles.linhaAcao, { color: palette.accent }]}>Voltar a receber</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </>
  );

  const explicacao =
    "Com o foco ligado, nenhuma notificação chega. Ao sair, você recebe só a mais recente de cada tipo, e o que perdeu o sentido no caminho é descartado. Enquanto você estuda concentrado, o TrailUp também segura os avisos sozinho.";

  if (embutido) {
    return (
      <DuasColunasConfig
        apoio={
          <ApoioConfig titulo="Como funciona" palette={palette}>
            <TextoApoio palette={palette}>{explicacao}</TextoApoio>
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>Modo foco</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>{explicacao}</Text>
        {controles}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 16 },
  title: { fontSize: 24, fontFamily: FontFamily.inikaBold },
  subtitle: { fontSize: 14, lineHeight: 21, fontFamily: FontFamily.interMedium },
  esqueleto: { gap: 16 },
  cartao: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
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
  cartaoTexto: { flex: 1, gap: 2 },
  cartaoTitulo: { fontSize: 16, fontFamily: FontFamily.inikaBold },
  cartaoDescricao: { fontSize: 12, lineHeight: 18, fontFamily: FontFamily.interMedium },
  botao: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontSize: 15, fontFamily: FontFamily.inikaBold },
  secao: { gap: 10 },
  sectionLabel: { fontSize: 13, fontFamily: FontFamily.inikaBold, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16 },
  chipTexto: { fontSize: 14, fontFamily: FontFamily.inikaBold },
  vazio: { fontSize: 13, lineHeight: 19, fontFamily: FontFamily.interMedium },
  linhaSilenciado: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  linhaTexto: { flex: 1, fontSize: 14, fontFamily: FontFamily.interMedium },
  linhaAcao: { fontSize: 13, fontFamily: FontFamily.inikaBold },
});
