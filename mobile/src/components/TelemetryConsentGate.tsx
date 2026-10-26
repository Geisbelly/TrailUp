import {
  definirAlunoDoConsentimento,
  getTelemetryConsentRecord,
  setTelemetryConsentAccepted,
  setTelemetryConsentRejected,
  TELEMETRY_CONSENT_VERSION,
} from "@/utils/telemetryConsent";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarConsentimentoTelemetriaNoServidor } from "@/services/consentimentoTelemetriaSupabase";
import {
  carregarEstadoConsentimento,
  limparEstadoConsentimento,
} from "@/services/consentimentoResponsavelApi";
import { useEstadoConsentimento } from "@/hooks/useEstadoConsentimento";
import { proximoPasso } from "@/utils/consentimentoResponsavel";
import { DataNascimentoForm } from "@/components/consentimento/DataNascimentoForm";
import { ResponsavelConsentForm } from "@/components/consentimento/ResponsavelConsentForm";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { perfilVisualDoAluno } from "@/utils/brainHex";

// O modulo da camera saiu daqui junto com o pedido de permissao: aceitar os
// termos nao toca na camera. Quem carrega `expo-camera` e pede a permissao e
// `MetricasContext.setCameraOptIn`, acionado pelo toggle explicito.

export function TelemetryConsentGate() {
  // Este portão aparece DEPOIS do login, por cima do app, e era a única tela cheia que não
  // seguia o perfil: tinha paleta própria (slate do Tailwind, botão azul) que não existe em
  // lugar nenhum do sistema. Sem perfil hidratado ainda, `getProfileShellPalette` devolve o
  // neutro — que é o certo para quem ainda não tem perfil.
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );
  const alunoId = usuario?.id ?? null;
  const estado = useEstadoConsentimento();
  const [termoPendente, setTermoPendente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "Agora nao" vale para esta abertura do app: o aluno segue no modo
  // restrito e o pedido volta na proxima vez (ou em Perfil > Coleta e acessos).
  const [adiouNascimento, setAdiouNascimento] = useState(false);
  const [adiouResponsavel, setAdiouResponsavel] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAdiouNascimento(false);
    setAdiouResponsavel(false);

    if (!alunoId) {
      // Sem aluno logado nao ha consentimento de ninguem.
      void definirAlunoDoConsentimento(null);
      limparEstadoConsentimento();
      setTermoPendente(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    (async () => {
      // O aceite local e POR ALUNO (#195): troca a chave antes de ler.
      await definirAlunoDoConsentimento(alunoId);
      const [record] = await Promise.all([
        getTelemetryConsentRecord(),
        carregarEstadoConsentimento(),
      ]);
      if (!active) return;
      setTermoPendente(!record || record.version !== TELEMETRY_CONSENT_VERSION);
      // Retentativa: o aceite pode ter sido gravado localmente sem a rede
      // responder. Repetir e inofensivo -- a tabela tem UNIQUE por
      // (aluno, versao, decisao) e o 23505 volta como sucesso.
      if (record) void registrarConsentimentoTelemetriaNoServidor(record);
    })()
      .catch((erro) => console.warn("[Consentimento] falha ao carregar:", erro))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [alunoId]);

  const passo = proximoPasso(estado);
  const etapa: "data_nascimento" | "responsavel" | "termo" | null = !alunoId
    ? null
    : passo === "data_nascimento" && !adiouNascimento
    ? "data_nascimento"
    : passo === "responsavel" && !adiouResponsavel
    ? "responsavel"
    : termoPendente
    ? "termo"
    : null;
  const visible = etapa !== null;

  const handleAccept = async () => {
    setSaving(true);

    // Aceitar os termos NAO pede a camera nem a liga. Pedir a permissao aqui
    // tinha dois problemas: o aluno recebia o pedido do sistema no meio de um
    // fluxo em que so' estava lendo e aceitando, e conceder a permissao ligava
    // a captura sozinha — consentimento biometrico pre-marcado, que a LGPD
    // nao admite (art. 11, e art. 14 por ser publico escolar).
    //
    // Quem pede a permissao agora e `setCameraOptIn`, acionado pelo toggle em
    // Perfil -> Coleta e acessos: so' liga se o aluno for ate la' e, ai sim, o
    // sistema perguntar. Ver issue #195.
    await setTelemetryConsentAccepted({
      cameraPermissionRequested: false,
      cameraPermissionGranted: false,
      preferences: {
        cameraEnabled: false,
        usageEnabled: true,
        performanceEnabled: true,
        chatEnabled: true,
      },
    });
    void registrarConsentimentoTelemetriaNoServidor(await getTelemetryConsentRecord());
    setTermoPendente(false);
    setSaving(false);
  };

  const handleReject = async () => {
    setSaving(true);
    await setTelemetryConsentRejected();
    // Recusa tambem e registrada: revogar nao e apagar, e o historico
    // append-only e o que permite responder "o que estava aceito no dia X".
    void registrarConsentimentoTelemetriaNoServidor(await getTelemetryConsentRecord());
    setTermoPendente(false);
    setSaving(false);
  };

  if (loading) return null;

  if (etapa === "data_nascimento" || etapa === "responsavel") {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {etapa === "data_nascimento" ? (
                <DataNascimentoForm
                  palette={palette}
                  onConcluido={() => undefined}
                  onAdiar={() => setAdiouNascimento(true)}
                />
              ) : (
                <ResponsavelConsentForm
                  palette={palette}
                  estado={estado}
                  onConcluido={() => undefined}
                  onAdiar={() => setAdiouResponsavel(true)}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.text }]}>Termos de coleta para personalização</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Para adaptar conteúdo, interface e dificuldade, o TrailUp pode coletar
              sinais de estudo durante o uso do app.
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.accent }]}>Informações coletadas</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Câmera frontal durante sessões de estudo, com captura de 10 frames por
              minuto e envio em lote a cada 1 minuto.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Tempo de leitura, tempo ativo/inativo, histórico recente de navegação,
              toques, rolagem e contexto do tópico/atividade.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Respostas e desempenho em exercícios para ajuste pedagógico.
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.accent }]}>Como os dados são usados</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Atenção, dificuldade, frustração e engajamento são estimados a partir do
              seu comportamento no app — tempo ativo e inativo, toques, rolagem,
              respostas e acertos — e também da sua expressão facial, quando a câmera
              está ligada. É isso que gera as recomendações e o conteúdo adaptativo.
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.accent }]}>Sobre a câmera, especificamente</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              As imagens da câmera são analisadas para estimar sua expressão no
              momento do estudo. O programa localiza o rosto na imagem e classifica a
              expressão em categorias como neutro, concentrado, frustrado, ansioso ou
              cansado. Isso influencia o conteúdo e a dificuldade que o app te mostra
              depois.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              A análise é feita no servidor do próprio TrailUp, não em serviço de
              terceiros, e a imagem não sai dele para lugar nenhum.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              A imagem é usada e descartada na mesma hora. Não é gravada em lugar
              nenhum — nem no registro do lote, nem no log de decisão. Fica guardado
              só o resultado: a categoria estimada e o quanto o programa confia nela.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              O que você faz vale mais do que a sua cara. Se você errar várias vezes
              seguidas, por exemplo, isso conta mais do que a expressão de um
              instante — e a estimativa pela imagem é descartada nesse caso.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              A expressão estimada é um palpite, não um diagnóstico. Ela não vira
              nota, não é mostrada para o professor como avaliação sua, e pode errar.
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.accent }]}>Menores de 18 anos</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Se você tem menos de 18 anos, câmera, análise de emoções, telemetria,
              mentor de IA e pesquisa só ligam depois que seu responsável autorizar,
              numa tela separada no app ou pelo termo em papel entregue ao
              professor. Até lá o app fica no modo restrito: trilhas, questões e
              progresso funcionam normalmente.
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.accent }]}>Sua escolha</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Se você aceitar, a coleta de uso, desempenho e chat começa — mas a
              câmera continua desligada. Ela só liga se você for em Perfil →
              Coleta e acessos e ativar; é lá que o aparelho pede a permissão. Se
              recusar, o app continua funcionando sem a coleta comportamental
              adaptativa.
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Recusar não tira nenhum conteúdo de você e não muda sua nota. Você
              também pode aceitar o resto e desligar só a câmera, agora ou depois, em
              Perfil → Coleta e acessos.
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
              disabled={saving}
              onPress={() => {
                void handleReject();
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.text }]}>Recusar coleta</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, { backgroundColor: palette.accent }, saving ? styles.disabledButton : null]}
              disabled={saving}
              onPress={() => {
                void handleAccept();
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background }]}>
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
    // O veu continua neutro de proposito: ele escurece o app ATRAS do cartao, e tingi-lo com a
    // cor do perfil competiria com o proprio cartao, que ja' e' a superficie do perfil.
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    maxHeight: "82%",
    borderWidth: 1,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    marginTop: 14,
    marginBottom: 8,
  },
  body: {
    fontFamily: FontFamily.interMedium,
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
  primaryButton: {},
  primaryButtonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.7,
  },
});
