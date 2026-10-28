import { HallBackground } from "@/components/HallTheme";
import { Interruptor } from "@/components/perfil/Interruptor";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useMetricas } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { TelemetryConsentPreferences } from "@/utils/telemetryConsent";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { useEstadoConsentimento } from "@/hooks/useEstadoConsentimento";
import { registrarConsentimentoPesquisa } from "@/services/consentimentoResponsavelApi";
import { mensagemDoModo, type EstadoConsentimento } from "@/utils/consentimentoResponsavel";
import { DataNascimentoForm } from "@/components/consentimento/DataNascimentoForm";
import { ResponsavelConsentForm } from "@/components/consentimento/ResponsavelConsentForm";

// O que o servidor libera para cada toggle (#195). Camera precisa tambem da
// analise de emocoes; os outros grupos sao telemetria de comportamento.
function toggleLiberado(key: keyof TelemetryConsentPreferences, estado: EstadoConsentimento): boolean {
  if (key === "cameraEnabled") return estado.finalidades.camera && estado.finalidades.emocional;
  return estado.finalidades.telemetria;
}

type ToggleItem = {
  key: keyof TelemetryConsentPreferences;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const TOGGLE_ITEMS: ToggleItem[] = [
  {
    key: "cameraEnabled",
    // O rotulo diz o que acontece, nao o sensor usado: quem le "Camera" nao
    // deduz que a propria expressao sera classificada.
    title: "Câmera e expressão facial",
    description:
      "Captura imagens durante o estudo e estima sua expressão (neutro, concentrado, frustrado…) para adaptar o conteúdo. A imagem é descartada após a análise; só o resultado é guardado.",
    icon: "camera-outline",
  },
  {
    key: "usageEnabled",
    title: "Uso e navegação",
    description: "Coleta sessões, navegação e interações para métricas de engajamento.",
    icon: "gesture-tap",
  },
  {
    key: "performanceEnabled",
    title: "Desempenho",
    description: "Coleta tentativas, acertos e evolução em questões e atividades.",
    icon: "chart-line",
  },
  {
    key: "chatEnabled",
    title: "Chat",
    description: "Coleta abertura, mensagens e contexto de uso do mentor.",
    icon: "chat-processing-outline",
  },
];

export default function ColetaDadosScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const cameraPermissionGuideRef = useRef<View | null>(null);
  const toggleGuideRefs = useMemo<
    Record<keyof TelemetryConsentPreferences, React.RefObject<View | null>>
  >(
    () => ({
      cameraEnabled: React.createRef<View>(),
      usageEnabled: React.createRef<View>(),
      performanceEnabled: React.createRef<View>(),
      chatEnabled: React.createRef<View>(),
    }),
    [],
  );
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );
  const { telemetryPreferences, setTelemetryPreference, cameraPermission } = useMetricas();
  const [savingKey, setSavingKey] = useState<keyof TelemetryConsentPreferences | null>(null);
  const estado = useEstadoConsentimento();
  const avisoRestrito = mensagemDoModo(estado);
  const [formResponsavelAberto, setFormResponsavelAberto] = useState(false);
  const [salvandoPesquisa, setSalvandoPesquisa] = useState(false);
  const [erroPesquisa, setErroPesquisa] = useState<string | null>(null);

  const alternarPesquisa = async () => {
    if (salvandoPesquisa) return;
    setSalvandoPesquisa(true);
    setErroPesquisa(null);
    const r = await registrarConsentimentoPesquisa(!estado.pesquisaAceita);
    setSalvandoPesquisa(false);
    if (!r.ok) setErroPesquisa(r.erro);
  };
  const guideSteps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "collection-camera",
        target: "collection_camera",
        title: "Ativar ou desativar a câmera",
        description:
          "A câmera é opcional. Ativo permite analisar frames durante o estudo, desde que o Android também tenha concedido a permissão. Desativado interrompe essa captura sem bloquear aulas, atividades ou notas.",
        icon: "camera-outline",
      },
      {
        id: "collection-usage",
        target: "collection_usage",
        title: "Uso e navegação",
        description:
          "Controla o registro de sessões, páginas visitadas e interações usado para calcular engajamento, continuidade e tempo de uso.",
        icon: "gesture-tap",
      },
      {
        id: "collection-performance",
        target: "collection_performance",
        title: "Desempenho acadêmico",
        description:
          "Controla o registro de tentativas, acertos e evolução nas atividades. Essas informações alimentam as métricas de aprendizagem.",
        icon: "chart-line",
      },
      {
        id: "collection-chat",
        target: "collection_chat",
        title: "Ativar ou desativar o chat",
        description:
          "Ativo permite registrar abertura, mensagens e contexto de uso do mentor para melhorar o apoio. Desativado interrompe esse registro; o estado pode ser alterado aqui a qualquer momento.",
        icon: "chat-processing-outline",
      },
      {
        id: "collection-permission",
        target: "collection_permission",
        title: "Permissão do aparelho",
        description:
          "Este estado vem do Android. A coleta por câmera só funciona quando o controle acima está Ativo e a permissão do sistema está Permitida.",
        icon: "shield-lock-outline",
      },
    ],
    [],
  );
  const guideTargets = useMemo(
    () => ({
      collection_camera: toggleGuideRefs.cameraEnabled,
      collection_usage: toggleGuideRefs.usageEnabled,
      collection_performance: toggleGuideRefs.performanceEnabled,
      collection_chat: toggleGuideRefs.chatEnabled,
      collection_permission: cameraPermissionGuideRef,
    }),
    [toggleGuideRefs],
  );

  useEffect(
    () =>
      registrarAlvoTour("config_camera", toggleGuideRefs.cameraEnabled, () => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }),
    [toggleGuideRefs],
  );
  useEffect(
    () =>
      registrarAlvoTour("config_chat", toggleGuideRefs.chatEnabled, () => {
        scrollRef.current?.scrollTo({ y: 190, animated: false });
      }),
    [toggleGuideRefs],
  );

  const handleToggle = async (key: keyof TelemetryConsentPreferences) => {
    if (savingKey) return;
    if (!toggleLiberado(key, estado)) return;
    setSavingKey(key);
    try {
      await setTelemetryPreference(key, !telemetryPreferences[key]);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
      <SectionGuideButton
        profile={perfilVisualDoAluno(usuario)}
        sectionTitle="Coleta e acessos"
        steps={guideSteps}
        targetRefs={guideTargets}
        scrollRef={scrollRef}
        scrollOffsetRef={scrollOffsetRef}
        style={styles.guideButton}
      />
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      {embutido ? null : (
        <>
          <Text style={[styles.title, { color: palette.text }]}>Coleta e acessos</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            Você controla quais grupos de dados o app pode coletar. Cada mudança é registrada no servidor na hora.
          </Text>
        </>
      )}

      {avisoRestrito ? (
        <View
          accessibilityRole="alert"
          style={[styles.infoBox, { backgroundColor: palette.surface, borderColor: "#f5a524" }]}
        >
          <Text style={[styles.infoTitle, { color: palette.text }]}>Modo restrito</Text>
          <Text style={[styles.infoBody, { color: palette.textMuted }]}>{avisoRestrito}</Text>
        </View>
      ) : null}

      {!estado.dataNascimentoInformada ? (
        <View style={[styles.infoBox, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
          <DataNascimentoForm palette={palette} onConcluido={() => undefined} />
        </View>
      ) : estado.menor ? (
        <View style={[styles.infoBox, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
          <Text style={[styles.infoTitle, { color: palette.text }]}>Autorização do responsável</Text>
          <Text style={[styles.infoBody, { color: palette.textMuted }]}>
            {estado.responsavel?.vigente && estado.responsavel.status === "accepted"
              ? `Autorizado (${estado.responsavel.metodo === "papel" ? "termo em papel" : "no aparelho"}) em ${new Date(estado.responsavel.decidido_em).toLocaleDateString("pt-BR")}.`
              : estado.responsavel?.vigente
              ? "Seu responsável não autorizou. Ele pode mudar de ideia aqui ou pelo termo em papel."
              : "Ainda sem autorização. Entregue o aparelho ao seu responsável ou peça ao professor o termo em papel."}
          </Text>
          {formResponsavelAberto ? (
            <ResponsavelConsentForm
              palette={palette}
              estado={estado}
              onConcluido={() => setFormResponsavelAberto(false)}
              onAdiar={() => setFormResponsavelAberto(false)}
            />
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setFormResponsavelAberto(true)}
              style={[styles.stateChip, { alignSelf: "flex-start", backgroundColor: palette.accent, borderColor: palette.borderStrong }]}
            >
              <Text style={[styles.stateChipText, { color: "#fff" }]}>Abrir tela do responsável</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        {TOGGLE_ITEMS.map((item) => {
          const liberado = toggleLiberado(item.key, estado);
          const enabled = liberado && telemetryPreferences[item.key];
          const isSaving = savingKey === item.key;
          return (
            <View
              key={item.key}
              ref={toggleGuideRefs[item.key]}
              collapsable={false}
            >
              <TouchableOpacity
                style={[styles.itemRow, { borderColor: palette.border }]}
                activeOpacity={0.85}
                onPress={() => {
                  void handleToggle(item.key);
                }}
                disabled={Boolean(savingKey) || !liberado}
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled, disabled: Boolean(savingKey) || !liberado }}
              >
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: enabled ? palette.accentMuted : palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={18}
                    color={enabled ? palette.accent : palette.textSubtle}
                  />
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={[styles.itemTitle, { color: palette.text }]}>{item.title}</Text>
                  <Text style={[styles.itemDescription, { color: palette.textMuted }]}>
                    {item.description}
                  </Text>
                </View>
              </View>
              <Interruptor ligado={enabled} salvando={isSaving} bloqueado={!liberado} palette={palette} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        <TouchableOpacity
          style={[styles.itemRow, { borderColor: palette.border }]}
          activeOpacity={0.85}
          onPress={() => void alternarPesquisa()}
          disabled={salvandoPesquisa}
          accessibilityRole="switch"
          accessibilityState={{ checked: estado.pesquisaAceita, disabled: salvandoPesquisa }}
        >
          <View style={styles.itemLeft}>
            <View style={[styles.iconWrap, { backgroundColor: estado.pesquisaAceita ? palette.accentMuted : palette.surface, borderColor: palette.border }]}>
              <MaterialCommunityIcons name="flask-outline" size={18} color={estado.pesquisaAceita ? palette.accent : palette.textSubtle} />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.itemTitle, { color: palette.text }]}>Pesquisa acadêmica</Text>
              <Text style={[styles.itemDescription, { color: palette.textMuted }]}>
                Permite usar seus dados, sem identificação, na pesquisa sobre aprendizagem do projeto TrailUp. Desligado por padrão; não muda nada no seu uso do app.
                {estado.menor ? " Como você tem menos de 18 anos, só vale se seu responsável também autorizar a pesquisa." : ""}
              </Text>
              {erroPesquisa ? <Text style={[styles.itemDescription, { color: "#e5484d" }]}>{erroPesquisa}</Text> : null}
            </View>
          </View>
          <Interruptor ligado={estado.pesquisaAceita} salvando={salvandoPesquisa} palette={palette} />
        </TouchableOpacity>
      </View>

      <View
        ref={cameraPermissionGuideRef}
        collapsable={false}
        style={[styles.infoBox, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Text style={[styles.infoTitle, { color: palette.text }]}>Permissão de câmera</Text>
        <Text style={[styles.infoBody, { color: palette.textMuted }]}>
          Estado atual:{" "}
          <Text style={{ color: palette.text, fontFamily: FontFamily.inikaBold }}>
            {cameraPermission === "granted"
              ? "permitida"
              : cameraPermission === "denied"
              ? "negada"
              : cameraPermission === "unavailable"
              ? "indisponível"
              : "não definida"}
          </Text>
        </Text>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  guideButton: {
    position: "absolute",
    top: 14,
    right: 18,
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLeft: {
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
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: FontFamily.inikaBold,
  },
  itemDescription: {
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
  infoBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: FontFamily.inikaBold,
  },
  infoBody: {
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
});
