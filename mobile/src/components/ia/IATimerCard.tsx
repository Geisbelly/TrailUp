/**
 * IATimerCard — card de temporizador com estilo medieval/místico.
 * Usado pelo IAFloatingOverlay (surface="overlay") e inline (surface="inline").
 */

import { useIA } from "@/context/IAContext";
import {
  IAFeatureKey,
  IAFeatureSelectorScope,
  IATimerTimeoutAction,
} from "@/interfaces/personalizacao/IAContracts";
import { FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  featureKey: Extract<IAFeatureKey, "activity_timer" | "reading_timer">;
  scope: IAFeatureSelectorScope;
  onTimeoutAction?: (action: IATimerTimeoutAction | null) => void;
  surface?: "inline" | "overlay";
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// ─── paleta estática medieval ────────────────────────────────────────────────
const GOLD        = "#d4af37";
const GOLD_DIM    = "rgba(212, 175, 55, 0.42)";
const GOLD_GLOW   = "rgba(212, 175, 55, 0.18)";
const PURPLE      = "#a78bfa";
const CARD_BG     = "rgba(7, 4, 20, 0.97)";
const CRIT_BG     = "rgba(35, 6, 12, 0.98)";
const CRIT_BORDER = "rgba(252, 100, 100, 0.55)";
const CRIT_COLOR  = "#fca5a5";

export function IATimerCard({
  featureKey,
  scope,
  onTimeoutAction,
  surface = "inline",
}: Props) {
  const { resolveFeature, emitSignal, setUserFeaturePreference } = useIA();
  const resolved = resolveFeature(scope, featureKey);
  const duration  = resolved.timer?.durationSec ?? 0;
  const warningAt = resolved.timer?.warningAtSec ?? null;
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const warningSentRef  = useRef(false);
  const timeoutSentRef  = useRef(false);
  const pulseAnim       = useRef(new Animated.Value(1)).current;

  const scopeKey = useMemo(() => {
    if (scope.scope === "session") return "session";
    if (scope.scope === "topic") return `topic:${scope.topicoId}`;
    return `item:${scope.itemKey}`;
  }, [scope]);

  // ── Reset ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSecondsLeft(duration);
    warningSentRef.current  = false;
    timeoutSentRef.current  = false;
  }, [duration, scopeKey, featureKey]);

  // ── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!resolved.enabled || !resolved.timer || resolved.timer.autoStart === false || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [resolved.enabled, resolved.timer, secondsLeft]);

  // ── Sinais ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!resolved.enabled || !resolved.timer) return;
    if (warningAt != null && secondsLeft <= warningAt && secondsLeft > 0 && !warningSentRef.current) {
      warningSentRef.current = true;
      emitSignal({
        type: "timer_warning",
        topicoId: scope.scope !== "session" ? (scope as any).topicoId ?? null : null,
        itemKey: scope.scope === "item" ? scope.itemKey : null,
        meta: { featureKey, warningAtSec: warningAt, secondsLeft },
      });
    }
    if (secondsLeft === 0 && !timeoutSentRef.current) {
      timeoutSentRef.current = true;
      emitSignal({
        type: "timer_timeout",
        topicoId: scope.scope !== "session" ? (scope as any).topicoId ?? null : null,
        itemKey: scope.scope === "item" ? scope.itemKey : null,
        meta: { featureKey, timeoutAction: resolved.timer.timeoutAction ?? null },
      });
      onTimeoutAction?.(resolved.timer.timeoutAction ?? null);
    }
  }, [emitSignal, featureKey, onTimeoutAction, resolved.enabled, resolved.timer, scope, secondsLeft, warningAt]);

  // ── Pulso crítico (native driver — só transform) ─────────────────────────
  const isCritical = secondsLeft <= Math.max(10, Number(warningAt ?? 10));

  useEffect(() => {
    if (!isCritical || secondsLeft === 0) {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isCritical, pulseAnim, secondsLeft]);

  if (!resolved.enabled || !resolved.timer) return null;

  const isActivity = featureKey === "activity_timer";
  const borderColor = isCritical ? CRIT_BORDER : GOLD_DIM;
  const bgColor     = isCritical ? CRIT_BG : CARD_BG;
  const timeColor   = isCritical ? CRIT_COLOR : GOLD;
  const iconColor   = isCritical ? CRIT_COLOR : GOLD;
  const titleColor  = isCritical ? "#ffb4b4" : "#e8e0ff";

  return (
    <Animated.View
      style={[
        styles.card,
        surface === "overlay" && styles.cardOverlay,
        { borderColor, backgroundColor: bgColor, transform: [{ scale: pulseAnim }] },
      ]}
    >
      {/* Gradiente de profundidade */}
      <LinearGradient
        colors={
          isCritical
            ? ["rgba(80, 10, 20, 0.45)", "rgba(0, 0, 0, 0)"]
            : ["rgba(60, 30, 90, 0.30)", "rgba(0, 0, 0, 0)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Cabeçalho ornamental */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            name={isActivity ? "timer-sand" : "book-clock-outline"}
            size={16}
            color={iconColor}
          />
          <Text style={[styles.title, { color: titleColor }]}>
            {resolved.timer.label ?? (isActivity ? "Temporizador" : "Tempo no módulo")}
          </Text>
        </View>

        <Pressable
          style={styles.closeBtn}
          hitSlop={8}
          onPress={() => void setUserFeaturePreference(featureKey, false)}
        >
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {/* Linha dourada */}
      <LinearGradient
        colors={[GOLD_GLOW, GOLD_DIM, GOLD_GLOW]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.divider}
        pointerEvents="none"
      />

      {/* Tempo */}
      <Text style={[styles.time, { color: timeColor }]}>
        {formatTime(secondsLeft)}
      </Text>

      {/* Subtexto */}
      <Text style={styles.helper}>
        {isActivity
          ? "Tempo suave para manter foco — não afeta sua pontuação."
          : "Janela sugerida de leitura para ajudar no ritmo."}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
    gap: 10,
  },
  cardOverlay: {
    marginTop: 0,
    shadowColor: GOLD,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    letterSpacing: 0.4,
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  time: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontSize: 34,
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  helper: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    color: "rgba(180, 170, 220, 0.65)",
    lineHeight: 17,
    textAlign: "center",
    fontStyle: "italic",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  closeTxt: {
    color: "rgba(212, 175, 55, 0.7)",
    fontSize: 11,
    fontFamily: FontFamily.interMedium,
  },
});
