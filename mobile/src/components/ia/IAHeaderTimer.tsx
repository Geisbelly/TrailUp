/**
 * IAHeaderTimer — chip compacto medieval/místico de tempo.
 * Flutua sobre o conteúdo do módulo (posicionado fora do ScrollView).
 *
 * Todas as animações usam useNativeDriver: true (apenas transform: scale).
 */

import { useIA } from "@/context/IAContext";
import { useUsuario } from "@/context/SessaoContext";
import {
  IAFeatureKey,
  IAFeatureSelectorScope,
  IATimerTimeoutAction,
} from "@/interfaces/personalizacao/IAContracts";
import { FontFamily } from "@/styles/GlobalStyle";
import { hasAnyBrainHexProfileSignal, resolveDominantBrainHexProfile } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";

type BattleScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;
type TimerFeature = Extract<IAFeatureKey, "activity_timer" | "reading_timer">;

type Props = {
  topicoId?: number | null;
  itemKey?: string | null;
  preferredTimerFeature?: TimerFeature | null;
  elapsedStartAtMs?: number | null;
  active?: boolean;
  onTimeoutAction?: (action: IATimerTimeoutAction | null) => void;
};

function pickTimerFeatureOrder(preferredTimerFeature?: TimerFeature | null): TimerFeature[] {
  if (preferredTimerFeature === "activity_timer") return ["activity_timer", "reading_timer"];
  if (preferredTimerFeature === "reading_timer") return ["reading_timer", "activity_timer"];
  return ["activity_timer", "reading_timer"];
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function IAHeaderTimer({
  topicoId = null,
  itemKey = null,
  preferredTimerFeature = null,
  elapsedStartAtMs = null,
  active = true,
  onTimeoutAction,
}: Props) {
  const { resolveFeature, emitSignal } = useIA();
  const { usuario } = useUsuario();
  const perfis = usuario?.perfis ?? null;
  const dominantProfile = resolveDominantBrainHexProfile(perfis, "seeker");
  const palette = useMemo(() => getProfileShellPalette(dominantProfile), [dominantProfile]);
  const hasTimerSignal = useMemo(
    () => hasAnyBrainHexProfileSignal(perfis, ["survivor", "mastermind", "achiever", "conqueror", "daredevil"]),
    [perfis]
  );

  // ── Scopes ──────────────────────────────────────────────────────────────────
  const itemScope = useMemo(
    () => active && topicoId != null && itemKey
      ? ({ scope: "item", topicoId, itemKey } as const)
      : null,
    [active, itemKey, topicoId]
  );
  const topicScope = useMemo(
    () => active && topicoId != null ? ({ scope: "topic", topicoId } as const) : null,
    [active, topicoId]
  );
  const timerFeatureOrder = useMemo(
    () => pickTimerFeatureOrder(preferredTimerFeature),
    [preferredTimerFeature]
  );

  const timerSelection = useMemo(() => {
    if (!active || !hasTimerSignal) return null;
    const scopes: BattleScope[] = [];
    if (itemScope) scopes.push(itemScope);
    if (topicScope) scopes.push(topicScope);
    for (const scope of scopes) {
      for (const featureKey of timerFeatureOrder) {
        const resolved = resolveFeature(scope, featureKey);
        if (resolved.enabled && resolved.timer) return { featureKey, scope, resolved };
      }
    }
    return null;
  }, [active, hasTimerSignal, itemScope, resolveFeature, timerFeatureOrder, topicScope]);

  // ── Timer state ─────────────────────────────────────────────────────────────
  const duration = timerSelection?.resolved.timer?.durationSec ?? 0;
  const warningAt = timerSelection?.resolved.timer?.warningAtSec ?? null;
  const isElapsedMode = timerSelection?.featureKey === "reading_timer";
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const warningSentRef = useRef(false);
  const timeoutSentRef = useRef(false);
  const pendingResetRef = useRef(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const pausedStartedAtRef = useRef<number | null>(null);
  const pausedAccumulatedMsRef = useRef(0);

  const isTimerRunning = active && isAppActive;

  const scopeKey = useMemo(() => {
    if (!timerSelection) return "none";
    if (timerSelection.scope.scope === "topic") return `topic:${timerSelection.scope.topicoId}`;
    return `item:${timerSelection.scope.itemKey}`;
  }, [timerSelection]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const becameActive = nextState === "active";
      setIsAppActive(becameActive);

      if (!becameActive) {
        if (pausedStartedAtRef.current == null) {
          pausedStartedAtRef.current = Date.now();
        }
        return;
      }

      if (pausedStartedAtRef.current != null) {
        pausedAccumulatedMsRef.current += Date.now() - pausedStartedAtRef.current;
        pausedStartedAtRef.current = null;
      }
    });

    return () => subscription.remove();
  }, []);

  // ── Animação de pulso crítico (native driver OK — só transform) ──────────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || !timerSelection) {
      pulseAnim.setValue(1);
      return;
    }
    const isCrit = !isElapsedMode && secondsLeft <= Math.max(10, Number(warningAt ?? 10)) && secondsLeft > 0;
    if (!isCrit) {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 420, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.95, duration: 420, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, isElapsedMode, pulseAnim, secondsLeft, timerSelection, warningAt]);

  // ── Reset ao mudar escopo ────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      pendingResetRef.current = false;
      setSecondsLeft(0);
      setElapsedSeconds(0);
      warningSentRef.current = false;
      timeoutSentRef.current = false;
      pausedStartedAtRef.current = null;
      pausedAccumulatedMsRef.current = 0;
      return;
    }
    pendingResetRef.current = true;
    setSecondsLeft(duration);
    setElapsedSeconds(0);
    warningSentRef.current = false;
    timeoutSentRef.current = false;
    pausedStartedAtRef.current = null;
    pausedAccumulatedMsRef.current = 0;
  }, [active, duration, scopeKey, timerSelection?.featureKey]);

  // ── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerRunning || !timerSelection?.resolved.enabled || !timerSelection.resolved.timer) return;
    if (timerSelection.resolved.timer.autoStart === false || isElapsedMode || secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [isTimerRunning, isElapsedMode, secondsLeft, timerSelection]);

  // ── Elapsed ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerRunning || !timerSelection?.resolved.enabled || !timerSelection.resolved.timer || !isElapsedMode) return;
    const update = () => {
      if (!elapsedStartAtMs) { setElapsedSeconds(0); return; }
      const pausedNow =
        pausedStartedAtRef.current != null ? Date.now() - pausedStartedAtRef.current : 0;
      const elapsedMs = Math.max(
        0,
        Date.now() - elapsedStartAtMs - pausedAccumulatedMsRef.current - pausedNow
      );
      setElapsedSeconds(Math.floor(elapsedMs / 1000));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [isTimerRunning, elapsedStartAtMs, isElapsedMode, timerSelection]);

  // ── Sinais de aviso / timeout ────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerRunning || !timerSelection?.resolved.enabled || !timerSelection.resolved.timer || isElapsedMode) return;
    if (pendingResetRef.current) {
      if (secondsLeft > 0) pendingResetRef.current = false;
      return;
    }
    if (warningAt != null && secondsLeft <= warningAt && secondsLeft > 0 && !warningSentRef.current) {
      warningSentRef.current = true;
      emitSignal({
        type: "timer_warning",
        topicoId: timerSelection.scope.scope !== "session" ? (timerSelection.scope as any).topicoId ?? null : null,
        itemKey: timerSelection.scope.scope === "item" ? timerSelection.scope.itemKey : null,
        meta: { featureKey: timerSelection.featureKey, warningAtSec: warningAt, secondsLeft },
      });
    }
    if (secondsLeft === 0 && !timeoutSentRef.current) {
      timeoutSentRef.current = true;
      emitSignal({
        type: "timer_timeout",
        topicoId: timerSelection.scope.scope !== "session" ? (timerSelection.scope as any).topicoId ?? null : null,
        itemKey: timerSelection.scope.scope === "item" ? timerSelection.scope.itemKey : null,
        meta: { featureKey: timerSelection.featureKey, timeoutAction: timerSelection.resolved.timer.timeoutAction ?? null },
      });
      onTimeoutAction?.(timerSelection.resolved.timer.timeoutAction ?? null);
    }
  }, [isTimerRunning, emitSignal, isElapsedMode, onTimeoutAction, secondsLeft, timerSelection, warningAt]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!active || !hasTimerSignal || !timerSelection?.resolved.enabled || !timerSelection.resolved.timer) {
    return null;
  }

  const displaySeconds = isElapsedMode ? elapsedSeconds : secondsLeft;
  const isCritical = !isElapsedMode && secondsLeft <= Math.max(10, Number(warningAt ?? 10));
  const isActivity = timerSelection.featureKey === "activity_timer";

  const chipBorderColor  = isCritical ? "rgba(248, 100, 100, 0.85)" : palette.borderStrong;
  const chipBg           = isCritical ? "rgba(45, 8, 14, 0.98)"      : "rgba(7, 4, 20, 0.97)";
  const chipShadow       = isCritical ? "#ef4444"                     : palette.accent;
  const dotColor         = isCritical ? "#fca5a5"                     : palette.accent;
  const iconColor        = isCritical ? "#fecaca"                     : palette.accent;
  const timeColor        = isCritical ? "#fff1f2"                     : palette.text;
  const labelColor       = isCritical ? "rgba(255,200,200,0.7)"       : palette.textMuted;

  return (
    <Animated.View
      style={[
        styles.chip,
        {
          borderColor: chipBorderColor,
          backgroundColor: chipBg,
          shadowColor: chipShadow,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Gema pulsante */}
      <View style={[styles.gemDot, { backgroundColor: dotColor }]} />

      {/* Ícone místico */}
      <MaterialCommunityIcons
        name={isActivity ? "timer-sand" : "clock-outline"}
        size={14}
        color={iconColor}
      />

      {/* Separador vertical ornamental */}
      <View style={[styles.sep, { backgroundColor: isCritical ? "rgba(252,165,165,0.25)" : palette.border }]} />

      {/* Tempo — fonte medieval */}
      <Text style={[styles.time, { color: timeColor }]}>
        {formatTime(displaySeconds)}
      </Text>

      {/* Label contextual */}
      <Text style={[styles.label, { color: labelColor }]}>
        {isActivity ? "restante" : "no módulo"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    // cores dinâmicas aplicadas inline
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 2 },
    elevation: 12,
  },
  gemDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  sep: {
    width: 1,
    height: 14,
  },
  time: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontSize: 14,
    letterSpacing: 0.5,
    lineHeight: 20,
  },
  label: {
    fontFamily: FontFamily.interMedium,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
});
