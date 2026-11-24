import { HallBackground } from "@/components/HallTheme";
import { EsqueletoBloco, EsqueletoGrupo } from "@/components/carregamento/Esqueleto";
import { ApoioConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";
import { useDialog } from "@/context/DialogContext";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { useUsuario } from "@/context/SessaoContext";
import {
  apagarPreferenciasDoGuia,
  definirColetaDoGuia,
  minhasPreferenciasDoGuia,
} from "@/services/preferenciasDoGuia";
import { FontFamily } from "@/styles/GlobalStyle";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import {
  descreverPostura,
  type PreferenciasDoGuia,
  rotulosDosGostos,
  temAlgoGuardado,
} from "@/utils/preferenciasDoGuia";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

/**
 * "O que o Guia sabe de você" (20261124_04): os gostos, o resumo e o jeito de conversar que o
 * Guardião aprendeu. O aluno vê tudo, apaga e desliga a coleta. O professor não vê esta tabela.
 */
export default function GuiaSabeScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const { showDialog, showConfirm } = useDialog();
  const palette = useMemo(() => getProfileShellPalette(perfilVisualDoAluno(usuario)), [usuario]);

  const [carregando, setCarregando] = useState(true);
  const [prefs, setPrefs] = useState<PreferenciasDoGuia | null>(null);
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!usuario?.id) return;
    setPrefs(await minhasPreferenciasDoGuia(String(usuario.id)));
    setCarregando(false);
  }, [usuario?.id]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const falhou = () =>
    showDialog({ title: "Não foi possível salvar", description: "Tente novamente em instantes.", tone: "warning" });

  const apagar = () =>
    showConfirm({
      title: "Apagar o que o Guia sabe?",
      description: "Os gostos, o resumo e o jeito de conversar somem. O Guia continua aprendendo nas próximas conversas.",
      tone: "warning",
      confirmLabel: "Apagar",
      confirmVariant: "danger",
      onConfirm: async () => {
        setSalvando(true);
        try {
          if (!(await apagarPreferenciasDoGuia())) return falhou();
          await recarregar();
        } finally {
          setSalvando(false);
        }
      },
    });

  const mudarColeta = async (ligada: boolean) => {
    if (salvando) return;
    const aplicar = async () => {
      setSalvando(true);
      try {
        if (!(await definirColetaDoGuia(ligada))) return falhou();
        await recarregar();
      } finally {
        setSalvando(false);
      }
    };
    if (ligada || !prefs || !temAlgoGuardado(prefs)) return void aplicar();
    showConfirm({
      title: "Parar de guardar?",
      description: "O que está guardado será apagado, e o Guia não guarda mais nada até você ligar de novo.",
      tone: "warning",
      confirmLabel: "Desligar e apagar",
      confirmVariant: "danger",
      onConfirm: aplicar,
    });
  };

  const gostos = rotulosDosGostos(prefs?.gostos);
  const postura = descreverPostura(prefs?.postura);
  const vazio = !prefs || !temAlgoGuardado(prefs);

  const controles = carregando ? (
    <EsqueletoGrupo rotulo="Carregando o que o Guia sabe" superficie={palette.surfaceElevated} style={styles.esqueleto}>
      <EsqueletoBloco largura="100%" altura={64} raio={16} />
      <EsqueletoBloco largura="100%" altura={120} raio={16} />
    </EsqueletoGrupo>
  ) : prefs === null ? (
    <Text style={[styles.vazio, { color: palette.textMuted }]}>
      Não foi possível carregar agora. Tente de novo em instantes.
    </Text>
  ) : (
    <>
      <View style={[styles.cartao, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <View style={styles.cartaoTexto}>
          <Text style={[styles.cartaoTitulo, { color: palette.text }]}>Guardar o que o Guia aprende</Text>
          <Text style={[styles.cartaoDescricao, { color: palette.textMuted }]}>
            {prefs.coleta_ligada ? "Ligado" : "Desligado: o Guia não guarda nada"}
          </Text>
        </View>
        <Switch
          value={prefs.coleta_ligada}
          onValueChange={(v) => void mudarColeta(v)}
          disabled={salvando}
          trackColor={{ true: palette.accent, false: palette.border }}
          accessibilityLabel="Guardar o que o Guia aprende sobre você"
        />
      </View>

      {vazio ? (
        <Text style={[styles.vazio, { color: palette.textMuted }]}>
          {prefs.coleta_ligada
            ? "Nada guardado ainda. Conforme você conversa com o Guia, ele anota aqui do que você gosta para dar exemplos do seu mundo."
            : "Nada guardado."}
        </Text>
      ) : (
        <View style={styles.secao}>
          {gostos.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Do que você gosta</Text>
              <View style={styles.chips}>
                {gostos.map((g) => (
                  <View key={g} style={[styles.chip, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
                    <Text style={[styles.chipTexto, { color: palette.text }]}>{g}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {prefs.resumo ? (
            <>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Como você gosta de aprender</Text>
              <Text style={[styles.texto, { color: palette.text }]}>{prefs.resumo}</Text>
            </>
          ) : null}
          {postura ? (
            <>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Jeito de conversar</Text>
              <Text style={[styles.texto, { color: palette.text }]}>{postura}</Text>
            </>
          ) : null}
          <TouchableOpacity
            style={[styles.botao, { borderColor: palette.borderStrong }]}
            onPress={apagar}
            disabled={salvando}
            accessibilityRole="button"
            accessibilityState={{ disabled: salvando }}
          >
            <Text style={[styles.botaoTexto, { color: palette.text }]}>Apagar tudo</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const explicacao =
    "Conversando com você, o Guia aprende do que você gosta e que jeito de conversar te ajuda, para explicar a matéria com exemplos do seu mundo. Só você vê isto; o professor não vê.";

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
        <Text style={[styles.title, { color: palette.text }]}>O que o Guia sabe de você</Text>
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
  cartaoTexto: { flex: 1, gap: 2 },
  cartaoTitulo: { fontSize: 16, fontFamily: FontFamily.inikaBold },
  cartaoDescricao: { fontSize: 12, lineHeight: 18, fontFamily: FontFamily.interMedium },
  secao: { gap: 10 },
  sectionLabel: { fontSize: 13, fontFamily: FontFamily.inikaBold, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  chipTexto: { fontSize: 14, fontFamily: FontFamily.interMedium },
  texto: { fontSize: 14, lineHeight: 21, fontFamily: FontFamily.interMedium },
  vazio: { fontSize: 13, lineHeight: 19, fontFamily: FontFamily.interMedium },
  botao: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 6 },
  botaoTexto: { fontSize: 15, fontFamily: FontFamily.inikaBold },
});
