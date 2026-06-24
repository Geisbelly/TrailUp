import {
  getTelemetryConsentRecord,
  setTelemetryConsentAccepted,
  setTelemetryConsentRejected,
  TELEMETRY_CONSENT_VERSION,
} from "@/utils/telemetryConsent";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type CameraPermissionResponse = {
  granted?: boolean;
  status?: string;
};

const cameraModule =
  Platform.OS !== "web"
    ? (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require("expo-camera");
        } catch {
          return null;
        }
      })()
    : null;

const requestCameraPermissionsAsync =
  cameraModule?.requestCameraPermissionsAsync ??
  cameraModule?.Camera?.requestCameraPermissionsAsync ??
  null;

export function TelemetryConsentGate() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    getTelemetryConsentRecord()
      .then((record) => {
        if (!active) return;
        const shouldShow =
          !record || record.version !== TELEMETRY_CONSENT_VERSION;
        setVisible(shouldShow);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAccept = async () => {
    setSaving(true);

    let cameraPermissionRequested = false;
    let cameraPermissionGranted = false;

    if (Platform.OS !== "web" && requestCameraPermissionsAsync) {
      cameraPermissionRequested = true;
      try {
        const permission = (await requestCameraPermissionsAsync()) as
          | CameraPermissionResponse
          | undefined;
        cameraPermissionGranted =
          permission?.granted === true || permission?.status === "granted";
      } catch {
        cameraPermissionGranted = false;
      }
    }

    await setTelemetryConsentAccepted({
      cameraPermissionRequested,
      cameraPermissionGranted,
      preferences: {
        cameraEnabled: cameraPermissionGranted,
        usageEnabled: true,
        performanceEnabled: true,
        chatEnabled: true,
      },
    });
    setVisible(false);
    setSaving(false);
  };

  const handleReject = async () => {
    setSaving(true);
    await setTelemetryConsentRejected();
    setVisible(false);
    setSaving(false);
  };

  if (loading) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Termos de coleta para personalização</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.body}>
              Para adaptar conteúdo, interface e dificuldade, o TrailUp pode coletar
              sinais de estudo durante o uso do app.
            </Text>
            <Text style={styles.sectionTitle}>Informações coletadas</Text>
            <Text style={styles.body}>
              Câmera frontal durante sessões de estudo, com captura de 10 frames por
              minuto e envio em lote a cada 3 minutos.
            </Text>
            <Text style={styles.body}>
              Tempo de leitura, tempo ativo/inativo, histórico recente de navegação,
              toques, rolagem e contexto do tópico/atividade.
            </Text>
            <Text style={styles.body}>
              Respostas e desempenho em exercícios para ajuste pedagógico.
            </Text>
            <Text style={styles.sectionTitle}>Como os dados são usados</Text>
            <Text style={styles.body}>
              Os dados são enviados para a API para análise de atenção, dificuldade,
              frustração e engajamento, com geração de recomendações e conteúdo adaptativo.
            </Text>
            <Text style={styles.body}>
              Os frames da câmera são usados para análise e não são persistidos brutos
              no backend.
            </Text>
            <Text style={styles.sectionTitle}>Sua escolha</Text>
            <Text style={styles.body}>
              Se você aceitar, o app solicitará acesso aos recursos necessários,
              principalmente à câmera. Se recusar, o app continua funcionando sem a
              coleta comportamental adaptativa.
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              disabled={saving}
              onPress={() => {
                void handleReject();
              }}
            >
              <Text style={styles.secondaryButtonText}>Recusar coleta</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, saving ? styles.disabledButton : null]}
              disabled={saving}
              onPress={() => {
                void handleAccept();
              }}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? "Salvando..." : "Aceitar e continuar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(7, 16, 34, 0.72)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#0F172A",
    padding: 20,
    maxHeight: "82%",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.24)",
  },
  title: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionTitle: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 8,
  },
  body: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
  },
  primaryButtonText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#E2E8F0",
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.7,
  },
});
