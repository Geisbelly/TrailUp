import { useIA } from "@/context/IAContext";
import {
  IAEnemyPalette,
  IAEnemyVisualSpec,
  IAFeatureSelectorScope,
} from "@/interfaces/personalizacao/IAContracts";
import { FontFamily } from "@/styles/GlobalStyle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type BattlePanelScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;

type Props = {
  scope: BattlePanelScope;
  surface?: "inline" | "overlay";
};

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildFallbackVisual(archetype?: string | null): IAEnemyVisualSpec {
  const normalized = String(archetype ?? "").trim().toLowerCase();

  if (normalized.includes("mech")) {
    return {
      preset: "mech",
      badgeLabel: "Boss mecânico",
      palette: {
        primaryColor: "#38bdf8",
        secondaryColor: "#0f172a",
        accentColor: "#f8fafc",
        hpColor: "#fb7185",
        shieldColor: "#38bdf8",
        textColor: "#e2e8f0",
      },
    };
  }

  if (normalized.includes("scholar") || normalized.includes("mage")) {
    return {
      preset: "scholar",
      badgeLabel: "Boss arcano",
      palette: {
        primaryColor: "#a78bfa",
        secondaryColor: "#1e1b4b",
        accentColor: "#fef08a",
        hpColor: "#f97316",
        shieldColor: "#60a5fa",
        textColor: "#f8fafc",
      },
    };
  }

  if (normalized.includes("beast")) {
    return {
      preset: "beast",
      badgeLabel: "Boss selvagem",
      palette: {
        primaryColor: "#fb7185",
        secondaryColor: "#3f1d2e",
        accentColor: "#fde68a",
        hpColor: "#ef4444",
        shieldColor: "#60a5fa",
        textColor: "#fff7ed",
      },
    };
  }

  return {
    preset: "phantom",
    badgeLabel: "Boss",
    palette: {
      primaryColor: "#f97316",
      secondaryColor: "#26162b",
      accentColor: "#fcd34d",
      hpColor: "#f97316",
      shieldColor: "#60a5fa",
      textColor: "#f8fafc",
    },
  };
}

function mergePalette(palette?: IAEnemyPalette | null) {
  return {
    primaryColor: palette?.primaryColor ?? "#f97316",
    secondaryColor: palette?.secondaryColor ?? "#26162b",
    accentColor: palette?.accentColor ?? "#fcd34d",
    hpColor: palette?.hpColor ?? "#f97316",
    shieldColor: palette?.shieldColor ?? "#60a5fa",
    textColor: palette?.textColor ?? "#f8fafc",
  };
}

function ProgressBar({
  label,
  value,
  maxValue,
  color,
  textColor,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  textColor: string;
}) {
  const pct = maxValue > 0 ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 0;

  return (
    <View style={styles.barGroup}>
      <View style={styles.barHeader}>
        <Text style={[styles.barLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.barValue, { color: textColor }]}>
          {Math.round(value)} / {Math.round(maxValue)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function IABattlePanel({ scope, surface = "inline" }: Props) {
  const { getBattleState, resolveFeature, setUserFeaturePreference, emitSignal } = useIA();
  const resolvedBattle = resolveFeature(scope, "battle_mode");
  const battleState = getBattleState(scope);
  const previewState = useMemo(() => {
    if (!resolvedBattle.battle) return null;
    return {
      enemy: resolvedBattle.battle.enemy,
      currentHp: resolvedBattle.battle.enemy.hpMax,
      currentShield: Math.max(0, Number(resolvedBattle.battle.enemy.shieldMax ?? 0)),
      defeated: false,
      encounterEndsAt: null,
      itemKey: scope.scope === "item" ? scope.itemKey : resolvedBattle.battle.sourceItemKey ?? null,
    };
  }, [resolvedBattle.battle, scope]);
  const visual = useMemo(
    () =>
      battleState?.enemy.visual ??
      previewState?.enemy.visual ??
      resolvedBattle.battle?.enemy.visual ??
      buildFallbackVisual(
        battleState?.enemy.archetype ??
          previewState?.enemy.archetype ??
          resolvedBattle.battle?.enemy.archetype
      ),
    [
      battleState?.enemy.archetype,
      battleState?.enemy.visual,
      previewState?.enemy.archetype,
      previewState?.enemy.visual,
      resolvedBattle.battle?.enemy.archetype,
      resolvedBattle.battle?.enemy.visual,
    ]
  );
  const palette = mergePalette(visual?.palette);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Guarda o encounterEndsAt para o qual ja disparamos o contra-ataque,
  // evitando emitir o sinal repetidamente enquanto o tempo fica em 0.
  const counterAttackFiredRef = useRef<number | null>(null);

  useEffect(() => {
    const encounterEndsAt = battleState?.encounterEndsAt ?? null;
    if (!encounterEndsAt) {
      setSecondsLeft(null);
      return;
    }

    const updateTime = () => {
      const restante = Math.max(0, Math.ceil((encounterEndsAt - Date.now()) / 1000));
      setSecondsLeft(restante);
      if (
        restante <= 0 &&
        !battleState?.defeated &&
        counterAttackFiredRef.current !== encounterEndsAt
      ) {
        // Tempo do encontro esgotou: o boss revida (recupera vida + defesas).
        counterAttackFiredRef.current = encounterEndsAt;
        emitSignal({
          type: "encounter_timeout",
          topicoId: scope.scope === "topic" ? scope.topicoId : null,
          itemKey: scope.scope === "item" ? scope.itemKey : null,
        });
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [battleState?.encounterEndsAt, battleState?.defeated, emitSignal, scope]);

  if (!resolvedBattle.enabled || !resolvedBattle.battle) return null;

  const effectiveState = battleState ?? previewState;
  if (!effectiveState) return null;

  const enemy = effectiveState.enemy;
  const defeated = effectiveState.defeated;
  const artUrl = visual?.avatarUrl ?? enemy.avatarUrl ?? null;
  const backgroundUrl = visual?.backgroundUrl ?? null;
  const frameUrl = visual?.frameUrl ?? null;
  const effectUrl = visual?.effectUrl ?? null;
  const helperText = defeated
    ? resolvedBattle.battle.victoryMessage ?? "Inimigo derrotado neste conteúdo."
    : scope.scope === "item"
    ? "Leia este conteúdo e acerte atividades vinculadas para reduzir a vida do boss."
    : "Avance no tópico para reduzir a vida do inimigo.";

  return (
    <View
      style={[
        styles.card,
        surface === "overlay" && styles.cardOverlay,
        {
          borderColor: `${palette.primaryColor}55`,
          backgroundColor: palette.secondaryColor,
        },
      ]}
    >
      {backgroundUrl ? <Image source={{ uri: backgroundUrl }} style={styles.backgroundLayer} /> : null}
      {effectUrl ? <Image source={{ uri: effectUrl }} style={styles.effectLayer} /> : null}

      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            name={defeated ? "shield-check" : "sword-cross"}
            size={18}
            color={defeated ? "#34d399" : palette.primaryColor}
          />
          <Text style={[styles.title, { color: palette.accentColor }]}>
            {visual?.badgeLabel ?? (scope.scope === "item" ? "Boss do conteúdo" : "Modo batalha")}
          </Text>
        </View>
        <Pressable
          style={[
            styles.ghostButton,
            {
              borderColor: `${palette.accentColor}33`,
              backgroundColor: `${palette.secondaryColor}99`,
            },
          ]}
          onPress={() => void setUserFeaturePreference("battle_mode", false)}
        >
          <Text style={[styles.ghostButtonText, { color: palette.accentColor }]}>Desativar</Text>
        </Pressable>
      </View>

      <View style={styles.heroRow}>
        <View
          style={[
            styles.avatarShell,
            {
              borderColor: `${palette.accentColor}66`,
              backgroundColor: `${palette.primaryColor}22`,
            },
          ]}
        >
          {artUrl ? (
            <Image source={{ uri: artUrl }} style={styles.avatarImage} resizeMode="contain" />
          ) : (
            <MaterialCommunityIcons
              name={defeated ? "chess-king" : "skull-outline"}
              size={34}
              color={palette.accentColor}
            />
          )}
          {frameUrl ? <Image source={{ uri: frameUrl }} style={styles.frameLayer} resizeMode="stretch" /> : null}
        </View>

        <View style={styles.heroTextColumn}>
          <Text style={[styles.enemyName, { color: palette.textColor }]}>{enemy.name}</Text>
          {enemy.archetype ? (
            <Text style={[styles.enemyType, { color: `${palette.textColor}CC` }]}>{enemy.archetype}</Text>
          ) : null}
          {secondsLeft != null ? (
            <View
              style={[
                styles.timerChip,
                {
                  borderColor: `${palette.accentColor}55`,
                  backgroundColor: `${palette.secondaryColor}bb`,
                },
              ]}
            >
              <MaterialCommunityIcons name="timer-sand" size={14} color={palette.accentColor} />
              <Text style={[styles.timerText, { color: palette.accentColor }]}>
                {formatCountdown(secondsLeft)}
              </Text>
            </View>
          ) : resolvedBattle.battle.timing?.encounterDurationSec ? (
            <View
              style={[
                styles.timerChip,
                {
                  borderColor: `${palette.accentColor}55`,
                  backgroundColor: `${palette.secondaryColor}bb`,
                },
              ]}
            >
              <MaterialCommunityIcons name="clock-outline" size={14} color={palette.accentColor} />
              <Text style={[styles.timerText, { color: palette.accentColor }]}>
                {formatCountdown(resolvedBattle.battle.timing.encounterDurationSec)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ProgressBar
        label="Escudo"
        value={effectiveState.currentShield}
        maxValue={Math.max(0, Number(enemy.shieldMax ?? 0))}
        color={palette.shieldColor}
        textColor={palette.textColor}
      />
      <ProgressBar
        label="HP"
        value={effectiveState.currentHp}
        maxValue={enemy.hpMax}
        color={defeated ? "#34d399" : palette.hpColor}
        textColor={palette.textColor}
      />

      <Text style={[styles.helperText, { color: `${palette.textColor}DD` }]}>{helperText}</Text>
      {!artUrl && enemy.imagePrompt ? (
        <Text style={[styles.promptHint, { color: `${palette.textColor}99` }]}>
          Arte sugerida: {enemy.imagePrompt}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    gap: 10,
  },
  cardOverlay: {
    marginTop: 0,
    shadowColor: "#02040a",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  backgroundLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.16,
  },
  effectLayer: {
    position: "absolute",
    top: -20,
    right: -10,
    width: 120,
    height: 120,
    opacity: 0.24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroTextColumn: {
    flex: 1,
    gap: 4,
  },
  avatarShell: {
    width: 84,
    height: 84,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  frameLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  enemyName: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 17,
  },
  enemyType: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  timerChip: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  timerText: {
    fontFamily: FontFamily.poppinsExtraBold,
    fontSize: 12,
  },
  barGroup: {
    gap: 4,
  },
  barHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  barValue: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  barTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  helperText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  promptHint: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  ghostButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  ghostButtonText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
});
