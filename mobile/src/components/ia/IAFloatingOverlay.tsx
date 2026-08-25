import { useIA } from "@/context/IAContext";
import {
  IAFeatureKey,
  IAFeatureSelectorScope,
  IATimerTimeoutAction,
} from "@/interfaces/personalizacao/IAContracts";
import { useWindowDimensions, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useMemo } from "react";
import { IABattlePanel } from "./IABattlePanel";
import { IATimerCard } from "./IATimerCard";

type BattleScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;
type TimerFeature = Extract<IAFeatureKey, "activity_timer" | "reading_timer">;

type Props = {
  topicoId?: number | null;
  itemKey?: string | null;
  preferredTimerFeature?: TimerFeature | null;
  onTimerTimeoutAction?: (action: IATimerTimeoutAction | null) => void;
  mode?: "all" | "battle-only";
};

function pickTimerFeatureOrder(preferredTimerFeature?: TimerFeature | null): TimerFeature[] {
  if (preferredTimerFeature === "activity_timer") {
    return ["activity_timer", "reading_timer"];
  }
  if (preferredTimerFeature === "reading_timer") {
    return ["reading_timer", "activity_timer"];
  }
  return ["activity_timer", "reading_timer"];
}

export function IAFloatingOverlay({
  topicoId = null,
  itemKey = null,
  preferredTimerFeature = null,
  onTimerTimeoutAction,
  mode = "all",
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { resolveFeature } = useIA();

  const itemScope = useMemo(
    () =>
      topicoId != null && itemKey
        ? ({ scope: "item", topicoId, itemKey } as const)
        : null,
    [itemKey, topicoId]
  );
  const topicScope = useMemo(
    () => (topicoId != null ? ({ scope: "topic", topicoId } as const) : null),
    [topicoId]
  );
  const timerFeatureOrder = useMemo(
    () => pickTimerFeatureOrder(preferredTimerFeature),
    [preferredTimerFeature]
  );

  const timerSelection = useMemo(() => {
    if (mode === "battle-only") return null;

    const scopes: BattleScope[] = [];
    if (itemScope) scopes.push(itemScope);
    if (topicScope) scopes.push(topicScope);

    for (const scope of scopes) {
      for (const featureKey of timerFeatureOrder) {
        const resolved = resolveFeature(scope, featureKey);
        if (resolved.enabled && resolved.timer) {
          return { featureKey, scope };
        }
      }
    }

    return null;
  }, [itemScope, mode, resolveFeature, timerFeatureOrder, topicScope]);

  const battleScope = useMemo<BattleScope | null>(() => {
    if (itemScope && resolveFeature(itemScope, "battle_mode").enabled) {
      return itemScope;
    }
    if (topicScope && resolveFeature(topicScope, "battle_mode").enabled) {
      return topicScope;
    }
    return null;
  }, [itemScope, resolveFeature, topicScope]);

  if (!timerSelection && !battleScope) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          top: insets.top + 12,
          right: 12,
          maxWidth: Math.min(340, Math.max(220, width - 24)),
        },
      ]}
    >
      <View style={styles.stack}>
        {timerSelection ? (
          <IATimerCard
            featureKey={timerSelection.featureKey}
            scope={timerSelection.scope}
            onTimeoutAction={onTimerTimeoutAction}
            surface="overlay"
          />
        ) : null}

        {battleScope ? <IABattlePanel scope={battleScope} surface="overlay" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 40,
    width: "100%",
    alignItems: "flex-end",
  },
  stack: {
    width: "100%",
    gap: 10,
    maxWidth: 340,
  },
});
