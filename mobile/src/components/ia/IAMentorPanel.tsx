import { OrnamentDivider } from "@/components/HallTheme";
import { getBrainHexConfig, getBrainHexGuideName } from "@/constants/profileImages";
import { useIA } from "@/context/IAContext";
import { useMetricas } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { hasBrainHexProfileSignal } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import tinycolor from "tinycolor2";

type Props = {
  topicoId?: number | null;
  classeId?: number | null;
  scope?: "modulo" | "trilha_home";
  bottomOffset?: number;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type TutorialTip = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  message: string;
};

function buildDefaultGuideMessage(
  scope: "modulo" | "trilha_home",
  socialSignalStrong: boolean
) {
  if (scope === "trilha_home") {
    if (socialSignalStrong) {
      return "Posso conversar sobre por que sua trilha foi organizada desse jeito, resumir suas métricas recentes e sugerir por onde começar. Aqui, a conversa fica pronta no ícone e só abre quando você tocar nele.";
    }
    return "Posso explicar por que sua trilha foi personalizada, resumir métricas da sua jornada e sugerir por onde começar, sem entrar no gabarito das atividades.";
  }

  if (socialSignalStrong) {
    return "Vou acompanhar este módulo em formato de conversa. Posso comentar a personalização, explicar os elementos da tela e orientar seu estudo sem entregar respostas das atividades.";
  }

  return "Estou acompanhando este módulo como uma conversa. Posso comentar a personalização, explicar os elementos da tela e sugerir estratégia de estudo sem entregar respostas das atividades.";
}

function normalizeMentorReplyTone(raw: string) {
  let text = String(raw ?? "").trim();
  if (!text) return text;

  text = text
    .replace(/\b(o|a)\s+(aluno|aluna|estudante)\b/gi, "você")
    .replace(
      /\b(para o aluno|para a aluna|para o estudante|para a estudante)\b/gi,
      "para você"
    )
    .replace(/\b(ao aluno|a aluna|ao estudante|a estudante)\b/gi, "a você")
    .replace(/\bo guia\b/gi, "eu");

  return text;
}

function buildTutorialTips(
  scope: "modulo" | "trilha_home",
  options: {
    hasBattle: boolean;
    hasReadingTimer: boolean;
    hasActivityTimer: boolean;
  }
): TutorialTip[] {
  if (scope === "trilha_home") {
    return [
      {
        id: "trilha-overview",
        icon: "compass-outline",
        label: "Trilha",
        message:
          "Na tela inicial da trilha você encontra os módulos liberados, a ordem sugerida de estudo e o acesso ao chat comigo. Eu não abro sozinho aqui: você decide quando conversar.",
      },
      {
        id: "trilha-personalizacao",
        icon: "auto-fix",
        label: "Personalização",
        message:
          "A personalização usa seu perfil, histórico e métricas para reorganizar o estudo. Eu posso explicar por que um módulo recebeu certo formato, ritmo ou apoio.",
      },
      {
        id: "trilha-metricas",
        icon: "chart-line",
        label: "Métricas",
        message:
          "Eu também consigo resumir métricas simples da sua jornada, como progresso recente, tempo de estudo e sinais de leitura adaptativa observados na trilha.",
      },
    ];
  }

  const tips: TutorialTip[] = [
    {
      id: "modulo-overview",
      icon: "message-text-outline",
      label: "Conversa",
      message:
        "Neste módulo eu apareço como guia em formato de conversa. Você pode me responder para pedir explicações sobre a personalização, o fluxo do módulo e a melhor estratégia de estudo.",
    },
    {
      id: "modulo-progresso",
      icon: "chart-timeline-variant",
      label: "Progresso",
      message:
        "A barra horizontal mostra quanto do módulo já foi concluído. O contador ao lado indica quantas etapas já foram finalizadas dentro da sequência atual.",
    },
  ];

  if (options.hasReadingTimer || options.hasActivityTimer) {
    tips.push({
      id: "modulo-tempo",
      icon: "timer-outline",
      label: "Tempo",
      message: options.hasActivityTimer
        ? "O tempo regressivo vale para atividades quando a mecânica pede pressão. Já o tempo de leitura acompanha quanto você permaneceu no módulo ou no conteúdo ativo."
        : "Quando o módulo exibe o contador de tempo, ele acompanha sua permanência no conteúdo ativo e para assim que você sai da etapa atual.",
    });
  }

  if (options.hasBattle) {
    tips.push({
      id: "modulo-boss",
      icon: "sword-cross",
      label: "Boss",
      message:
        "O boss representa o desafio do módulo. Conforme você avança no conteúdo e acerta atividades, causa dano nele. Se o inimigo já tiver sido derrotado, o resumo do confronto continua disponível.",
    });
  }

  tips.push({
    id: "modulo-guardrail",
    icon: "shield-check-outline",
    label: "Limites",
    message:
      "Eu posso orientar, resumir métricas e explicar a personalização, mas não entrego respostas de atividades. Quando você pedir ajuda, eu respondo dentro desses limites.",
  });

  return tips;
}

export function IAMentorPanel({
  topicoId,
  classeId,
  scope = "modulo",
  bottomOffset = 110,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { usuario } = useUsuario();
  const {
    pendingCharacterCues,
    dismissCharacterCue,
    setUserFeaturePreference,
    resolveFeature,
  } = useIA();
  const { recordAppEvent } = useMetricas();
  const personalizacaoProvider = usePersonalizacaoProvider();

  const profileName = String(usuario?.perfis?.[0]?.nome ?? "mastermind").toLowerCase();
  const palette = useMemo(() => getProfileShellPalette(profileName), [profileName]);
  const guideConfig = useMemo(() => getBrainHexConfig(profileName), [profileName]);
  const guideName = useMemo(() => getBrainHexGuideName(profileName), [profileName]);
  const socialSignalStrong = useMemo(
    () => hasBrainHexProfileSignal(usuario?.perfis ?? null, "socializer"),
    [usuario?.perfis]
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const hasManualHomeOpenRef = useRef(false);
  const scopeHistoryRef = useRef<Record<string, ChatMessage[]>>({});

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnreadCue, setHasUnreadCue] = useState(false);

  const mentorScope =
    topicoId != null ? { scope: "topic" as const, topicoId } : ({ scope: "session" as const });
  const resolvedMentor = resolveFeature(mentorScope, "mentor_character");
  const resolvedBattle =
    topicoId != null
      ? resolveFeature({ scope: "topic", topicoId }, "battle_mode")
      : resolveFeature({ scope: "session" }, "battle_mode");
  const resolvedReadingTimer =
    topicoId != null
      ? resolveFeature({ scope: "topic", topicoId }, "reading_timer")
      : resolveFeature({ scope: "session" }, "reading_timer");
  const resolvedActivityTimer =
    topicoId != null
      ? resolveFeature({ scope: "topic", topicoId }, "activity_timer")
      : resolveFeature({ scope: "session" }, "activity_timer");

  const cue = useMemo(
    () =>
      pendingCharacterCues.find((entry) => {
        if (entry.featureKey && entry.featureKey !== "mentor_character") return false;
        if (topicoId == null) return true;
        return entry.topicoId == null || entry.topicoId === topicoId;
      }) ?? null,
    [pendingCharacterCues, topicoId]
  );
  const mentorSilencedByUser = resolvedMentor.disabledReason === "user_preference";

  const guideIntroMessage = useMemo(() => {
    const explicitCueMessage = String(cue?.message ?? "").trim();
    return explicitCueMessage || buildDefaultGuideMessage(scope, socialSignalStrong);
  }, [cue?.message, scope, socialSignalStrong]);

  const tutorialTips = useMemo(
    () =>
      buildTutorialTips(scope, {
        hasBattle: Boolean(resolvedBattle.enabled && resolvedBattle.battle),
        hasReadingTimer: Boolean(resolvedReadingTimer.enabled && resolvedReadingTimer.timer),
        hasActivityTimer: Boolean(resolvedActivityTimer.enabled && resolvedActivityTimer.timer),
      }),
    [resolvedActivityTimer.enabled, resolvedActivityTimer.timer, resolvedBattle.battle, resolvedBattle.enabled, resolvedReadingTimer.enabled, resolvedReadingTimer.timer, scope]
  );

  const cueId = cue?.id ?? null;
  const hasCue = cueId != null;
  const scopeKey = `${scope}:${classeId ?? "none"}:${topicoId ?? "none"}`;

  useEffect(() => {
    setDraft("");

    const baseIntro: ChatMessage = {
      id: cueId ? `${cueId}:assistant` : `${scope}:assistant:intro`,
      role: "assistant",
      content: guideIntroMessage,
    };

    const currentHistory = scopeHistoryRef.current[scopeKey] ?? [];
    if (!currentHistory.length) {
      scopeHistoryRef.current[scopeKey] = [baseIntro];
      setMessages([baseIntro]);
    } else {
      setMessages(currentHistory);
    }

    setHasUnreadCue(hasCue);

    if (scope === "trilha_home" && !hasManualHomeOpenRef.current) {
      setIsOpen(false);
    }
  }, [cueId, guideIntroMessage, hasCue, scope, scopeKey]);

  useEffect(() => {
    scopeHistoryRef.current[scopeKey] = messages;
  }, [messages, scopeKey]);

  useEffect(() => {
    if (!isOpen) return;
    setHasUnreadCue(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [isOpen, messages.length]);

  if (mentorSilencedByUser) {
    return (
      <View pointerEvents="box-none" style={[styles.overlay, { bottom: bottomOffset }]}>
        <View style={styles.launcherColumn}>
          <Pressable
            onPress={() => void setUserFeaturePreference("mentor_character", true)}
            style={[
              styles.reactivateButton,
              scope === "trilha_home" ? styles.reactivateButtonHome : null,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderStrong,
                shadowColor: palette.background,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="volume-off"
              size={scope === "trilha_home" ? 22 : 18}
              color={palette.accent}
            />
            {scope !== "trilha_home" ? (
              <Text style={[styles.reactivateText, { color: palette.text }]}>
                Reativar guia
              </Text>
            ) : null}
          </Pressable>
        </View>
      </View>
    );
  }

  if (!resolvedMentor.enabled || (!classeId && !cue && scope !== "modulo")) return null;

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.55).toRgbString();

  const avatarSource =
    cue?.avatarUrl || resolvedMentor.character?.avatarUrl
      ? { uri: String(cue?.avatarUrl ?? resolvedMentor.character?.avatarUrl) }
      : guideConfig.image;
  const speakerName =
    cue?.speakerName ?? resolvedMentor.character?.speakerName ?? guideName;
  const canChat = Boolean(classeId);
  const panelWidth =
    scope === "modulo"
      ? Math.min(windowWidth - 16, 496)
      : Math.min(windowWidth - 16, 438);
  const panelMaxHeight =
    scope === "modulo"
      ? Math.min(windowHeight * 0.76, 640)
      : Math.min(windowHeight * 0.76, 620);
  const messagesMaxHeight =
    scope === "modulo"
      ? Math.min(windowHeight * 0.4, 340)
      : Math.min(windowHeight * 0.42, 360);
  const currentTitle =
    cue?.title ??
    (scope === "trilha_home"
      ? `${guideName} na trilha`
      : `${guideName} no módulo`);

  const handleOpen = () => {
    if (scope === "trilha_home") {
      hasManualHomeOpenRef.current = true;
    }
    recordAppEvent({
      eventGroup: "chat",
      eventName: "chat_open",
      topicoId: topicoId ?? null,
      triggerContext: cue ? "unknown" : undefined,
      payload: {
        scope,
      },
    });
    setIsOpen(true);
    setHasUnreadCue(false);
  };

  const handleClose = () => {
    recordAppEvent({
      eventGroup: "chat",
      eventName: "chat_close",
      topicoId: topicoId ?? null,
      triggerContext: cue ? "unknown" : undefined,
      payload: {
        scope,
      },
    });
    setIsOpen(false);
  };

  const appendAssistantMessage = (content: string) => {
    const normalized = String(content ?? "").trim();
    if (!normalized) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const isDuplicateAssistant =
        last?.role === "assistant" &&
        String(last?.content ?? "").trim() === normalized;

      if (isDuplicateAssistant) {
        return prev;
      }

      return [
        ...prev,
        {
          id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}:assistant`,
          role: "assistant",
          content: normalized,
        },
      ];
    });
  };

  const handleTutorialAction = (tip: TutorialTip) => {
    if (scope === "trilha_home") {
      hasManualHomeOpenRef.current = true;
      setIsOpen(true);
    }
    appendAssistantMessage(tip.message);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !canChat || classeId == null) return;

    const nextUserMessage: ChatMessage = {
      id: `${Date.now()}:user`,
      role: "user",
      content: text,
    };

    const nextHistory = [...messages, nextUserMessage];
    setMessages(nextHistory);
    setDraft("");
    setSending(true);
    recordAppEvent({
      eventGroup: "chat",
      eventName: "chat_message",
      topicoId: topicoId ?? null,
      chatRole: "user",
      triggerContext: cue ? "unknown" : undefined,
      payload: {
        scope,
        message_length: text.length,
      },
    });

    try {
      const response = await personalizacaoProvider.conversarComMentorPersonalizacao({
        classe_id: classeId,
        topico_id: topicoId ?? null,
        escopo: scope,
        mensagem: text,
        historico: nextHistory.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      });

      const reply = normalizeMentorReplyTone(String(response?.reply ?? ""));
      if (!response || !reply) {
        throw new Error("mentor_reply_empty");
      }
      appendAssistantMessage(reply);
      recordAppEvent({
        eventGroup: "chat",
        eventName: "chat_message",
        topicoId: topicoId ?? null,
        chatRole: "assistant",
        triggerContext: cue ? "unknown" : undefined,
        payload: {
          scope,
          message_length: reply.length,
        },
      });

      if (response?.should_close) {
        if (cue) {
          dismissCharacterCue(cue.id);
        }
        setIsOpen(false);
      }
    } catch (error) {
      appendAssistantMessage(
        "Estou aqui para conversar com você sobre personalização, métricas e estratégia de estudo, mas falhei ao responder agora."
      );
      console.warn("[IAMentorPanel] Falha ao conversar com o guia:", error);
    } finally {
      setSending(false);
    }
  };



  const renderMessage = (message: ChatMessage) => {
    const isAssistant = message.role === "assistant";
    const bubbleStyle = isAssistant
      ? {
          backgroundColor: scope === "modulo" ? palette.surfaceElevated : palette.surface,
          borderColor: palette.border,
          alignSelf: "flex-start" as const,
        }
      : {
          backgroundColor: palette.accentMuted,
          borderColor: palette.borderStrong,
          alignSelf: "flex-end" as const,
        };

    if (scope !== "modulo" || !isAssistant) {
      return (
        <View key={message.id} style={[styles.messageBubble, bubbleStyle]}>
          <Text
            style={[
              styles.message,
              { color: isAssistant ? palette.textMuted : palette.text },
            ]}
          >
            {message.content}
          </Text>
        </View>
      );
    }

    return (
      <View key={message.id} style={styles.moduleAssistantRow}>
        <Image source={avatarSource} style={styles.inlineAvatar} resizeMode="cover" />
        <View style={[styles.moduleSpeechBubble, bubbleStyle]}>
          <View
            style={[
              styles.moduleSpeechTail,
              {
                backgroundColor: palette.surfaceElevated,
                borderLeftColor: palette.border,
                borderBottomColor: palette.border,
              },
            ]}
          />
          <Text style={[styles.moduleSpeakerName, { color: palette.accent }]}>
            {speakerName}
          </Text>
          <Text style={[styles.message, { color: palette.textMuted }]}>{message.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        { bottom: bottomOffset },
        isOpen ? styles.overlayOpen : null,
      ]}
    >
      {!isOpen ? (
        <View style={styles.launcherColumn}>
          <Pressable
            onPress={handleOpen}
            style={[
              styles.launcherButton,
              scope === "trilha_home" ? styles.homeLauncherButton : null,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: goldDim,
                shadowColor: palette.accent,
              },
            ]}
          >
            {scope === "trilha_home" ? (
              <MaterialCommunityIcons
                name="chat-processing-outline"
                size={24}
                color={palette.accent}
              />
            ) : (
              <>
                <Image source={avatarSource} style={styles.launcherAvatar} resizeMode="cover" />
                <View
                  style={[
                    styles.launcherIconWrap,
                    {
                      backgroundColor: palette.accentMuted,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="chat-processing-outline"
                    size={18}
                    color={palette.accent}
                  />
                </View>
              </>
            )}
            {hasUnreadCue ? (
              <View
                style={[
                  styles.unreadDot,
                  {
                    backgroundColor: palette.accent,
                    borderColor: palette.surfaceElevated,
                  },
                ]}
              />
            ) : null}
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.card,
            scope === "modulo" ? styles.cardModule : styles.cardFloating,
            {
              width: panelWidth,
              maxHeight: panelMaxHeight,
              backgroundColor: palette.surface,
              borderColor: goldDim,
              shadowColor: palette.accent,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerIdentity}>
              <View
                style={[
                  styles.avatarShell,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Image source={avatarSource} style={styles.avatarImage} resizeMode="cover" />
              </View>
              <View style={styles.titleWrap}>
                <View
                  style={[
                    styles.speakerChip,
                    {
                      backgroundColor: palette.accentMuted,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={guideConfig.icon_focus}
                    size={13}
                    color={palette.accent}
                  />
                  <Text style={[styles.speakerChipText, { color: palette.accent }]}>
                    {speakerName}
                  </Text>
                </View>
                <Text style={[styles.subtitle, { color: palette.text }]}>{currentTitle}</Text>
                <Text style={[styles.headerHint, { color: palette.textSubtle }]}>
                  {scope === "trilha_home"
                    ? "Toque nas explicações abaixo ou envie uma pergunta."
                    : socialSignalStrong
                    ? "Aqui a conversa tem mais peso. Posso orientar sua leitura, explicar a personalização e comentar o funcionamento da tela."
                    : "Converse comigo sobre o módulo, a personalização e o funcionamento desta tela."}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => void setUserFeaturePreference("mentor_character", false)}
                hitSlop={14}
                style={[
                  styles.iconButton,
                  styles.iconToggleButton,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="volume-high"
                  size={16}
                  color={palette.accent}
                />
              </Pressable>
              <Pressable onPress={handleClose} hitSlop={14} style={styles.iconButton}>
                <MaterialCommunityIcons name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.ornamentRow}>
            <OrnamentDivider color={gold} />
          </View>

          <View style={styles.tutorialWrap}>
            <Text style={[styles.tutorialLabel, { color: palette.textSubtle }]}>
              Modo tutorial
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tutorialRow}
            >
              {tutorialTips.map((tip) => (
                <Pressable
                  key={tip.id}
                  onPress={() => handleTutorialAction(tip)}
                  style={[
                    styles.tutorialChip,
                    {
                      backgroundColor: palette.surfaceElevated,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={tip.icon} size={14} color={palette.accent} />
                  <Text style={[styles.tutorialChipText, { color: palette.text }]}>
                    {tip.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView
            ref={scrollRef}
            style={[styles.messagesScroll, { maxHeight: messagesMaxHeight }]}
            contentContainerStyle={styles.messageStack}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.map(renderMessage)}
          </ScrollView>

          <View
            style={[
              styles.chatComposer,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.border,
              },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={
                scope === "trilha_home"
                  ? "Pergunte sobre a trilha, métricas ou personalização"
                  : "Responda ao guia ou pergunte sobre este módulo"
              }
              placeholderTextColor={palette.textSubtle}
              style={[styles.chatInput, { color: palette.text }]}
              editable={!sending && canChat}
              multiline
              textAlignVertical="top"
            />
            <Pressable
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    canChat && draft.trim() ? palette.accentMuted : palette.surface,
                  borderColor:
                    canChat && draft.trim() ? palette.borderStrong : palette.border,
                },
              ]}
              onPress={handleSend}
              disabled={!canChat || !draft.trim() || sending}
            >
              <MaterialCommunityIcons
                name={sending ? "timer-sand" : "send"}
                size={16}
                color={canChat && draft.trim() ? palette.accent : palette.textSubtle}
              />
            </Pressable>
          </View>

          <Text style={[styles.guardrailText, { color: palette.textSubtle }]}>
            Eu explico sua personalização, métricas e estratégia de estudo. Não entrego
            respostas prontas de atividades.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    right: 16,
    zIndex: 40,
    elevation: 20,
  },
  overlayOpen: {
    left: 16,
    right: 16,
    alignItems: "center",
  },
  launcherColumn: {
    alignItems: "flex-end",
    gap: 10,
  },
  launcherButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  homeLauncherButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  reactivateButton: {
    minWidth: 148,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  reactivateButtonHome: {
    minWidth: 58,
    width: 58,
    height: 58,
    borderRadius: 29,
    paddingHorizontal: 0,
  },
  reactivateText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  launcherAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
  },
  launcherIconWrap: {
    position: "absolute",
    right: -4,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  cardFloating: {
    alignSelf: "center",
  },
  cardModule: {
    alignSelf: "stretch",
    minWidth: 320,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  titleWrap: {
    flex: 1,
    gap: 6,
    paddingTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  iconToggleButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
  },
  speakerChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  speakerChipText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  subtitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  headerHint: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  tutorialWrap: {
    gap: 8,
  },
  tutorialLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  tutorialRow: {
    gap: 8,
    paddingRight: 8,
  },
  tutorialChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tutorialChipText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  messagesScroll: {
    minHeight: 72,
  },
  messageStack: {
    gap: 8,
    paddingRight: 2,
  },
  moduleAssistantRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "98%",
  },
  inlineAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  moduleSpeechBubble: {
    position: "relative",
    maxWidth: "86%",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  moduleSpeechTail: {
    position: "absolute",
    left: -7,
    bottom: 12,
    width: 14,
    height: 14,
    transform: [{ rotate: "45deg" }],
    borderLeftWidth: 1,
    borderBottomWidth: 1,
  },
  moduleSpeakerName: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: "92%",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  chatComposer: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 86,
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 18,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guardrailText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  ornamentRow: {
    opacity: 0.55,
    transform: [{ scaleY: 0.8 }],
  },
});
