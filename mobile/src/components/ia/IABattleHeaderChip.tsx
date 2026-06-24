import { useIA } from "@/context/IAContext";
import { useUsuario } from "@/context/SessaoContext";
import { IAFeatureSelectorScope } from "@/interfaces/personalizacao/IAContracts";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  hasBrainHexProfileSignal,
  resolveDominantBrainHexProfile,
} from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { IABattlePanel } from "./IABattlePanel";

type BattleScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;

type Props = {
  topicoId?: number | null;
  itemKey?: string | null;
};

function formatBattleDate(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "Não registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBattleDuration(startedAt?: number | null, endedAt?: number | null) {
  if (!startedAt || !Number.isFinite(startedAt)) return "Não iniciado";
  const finishAt = endedAt && Number.isFinite(endedAt) ? endedAt : Date.now();
  const totalSeconds = Math.max(0, Math.round((finishAt - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes}:${seconds}`;
  }

  return `${minutes}:${seconds}`;
}

function formatEncounterLimit(durationSec?: number | null) {
  if (!durationSec || durationSec <= 0) return "Sem limite";
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.max(0, durationSec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function BattleMetaStat({
  label,
  value,
  borderColor,
  backgroundColor,
  labelColor,
  valueColor,
}: {
  label: string;
  value: string;
  borderColor: string;
  backgroundColor: string;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <View
      style={[
        styles.metaStat,
        {
          borderColor,
          backgroundColor,
        },
      ]}
    >
      <Text style={[styles.metaStatLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.metaStatValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export function IABattleHeaderChip({ topicoId = null, itemKey = null }: Props) {
  const [open, setOpen] = useState(false);
  const { getBattleState, resolveFeature } = useIA();
  const { usuario } = useUsuario();
  const profileName = resolveDominantBrainHexProfile(usuario?.perfis ?? null, "seeker");
  const hasBattleSignal = hasBrainHexProfileSignal(usuario?.perfis ?? null, "survivor");
  const palette = useMemo(() => getProfileShellPalette(profileName), [profileName]);

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

  const battleScope = useMemo<BattleScope | null>(() => {
    if (itemScope && resolveFeature(itemScope, "battle_mode").enabled) {
      return itemScope;
    }
    if (topicScope && resolveFeature(topicScope, "battle_mode").enabled) {
      return topicScope;
    }
    return null;
  }, [itemScope, resolveFeature, topicScope]);

  const battleState = battleScope ? getBattleState(battleScope) : null;
  const resolvedBattle = battleScope ? resolveFeature(battleScope, "battle_mode") : null;

  if (
    !hasBattleSignal ||
    !battleScope ||
    !resolvedBattle?.enabled ||
    !resolvedBattle.battle ||
    !battleState
  ) {
    return null;
  }

  const enemy = battleState?.enemy ?? resolvedBattle.battle.enemy;
  const hpMax = Math.max(1, Number(enemy.hpMax ?? 1));
  const hpCurrent = Math.max(
    0,
    Number(battleState?.currentHp ?? resolvedBattle.battle.enemy.hpMax ?? hpMax)
  );
  const hpPct = Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100));
  const avatarUrl =
    battleState?.enemy.visual?.avatarUrl ??
    resolvedBattle.battle.enemy.visual?.avatarUrl ??
    enemy.avatarUrl ??
    null;
  const battleStatusLabel = battleState?.defeated ? "Derrotado" : "Em batalha";
  const scopeLabel =
    battleScope.scope === "item" ? "Confronto do conteúdo" : "Confronto do módulo";
  const startedAtLabel = formatBattleDate(battleState?.startedAt ?? null);
  const defeatedAtLabel = battleState?.defeated
    ? formatBattleDate(battleState?.defeatedAt ?? null)
    : "Ainda ativo";
  const lastDamageAtLabel = formatBattleDate(battleState?.lastDamageAt ?? null);
  const durationLabel = formatBattleDuration(
    battleState?.startedAt ?? null,
    battleState?.defeatedAt ?? null
  );
  const encounterLimitLabel = formatEncounterLimit(
    resolvedBattle?.battle?.timing?.encounterDurationSec ?? null
  );

  return (
    <>
      <Pressable
        style={[
          styles.chip,
          {
            borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceElevated,
          },
        ]}
        onPress={() => setOpen(true)}
      >
        <View
          style={[
            styles.avatarWrap,
            {
              backgroundColor: palette.accentMuted,
            },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <MaterialCommunityIcons
              name={battleState?.defeated ? "shield-check" : "sword-cross"}
              size={16}
              color={palette.text}
            />
          )}
        </View>
        <View style={styles.info}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: palette.text }]}>Boss</Text>
            <Text
              style={[
                styles.statusLabel,
                {
                  color: battleState?.defeated ? palette.accentStrong : palette.accent,
                },
              ]}
            >
              {battleStatusLabel}
            </Text>
          </View>
          <View
            style={[
              styles.hpTrack,
              { backgroundColor: palette.progressTrack },
            ]}
          >
            <View
              style={[
                styles.hpFill,
                {
                  width: `${battleState?.defeated ? 100 : Math.max(10, hpPct)}%`,
                  backgroundColor: battleState?.defeated ? palette.accentStrong : palette.accent,
                },
              ]}
            />
          </View>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.backdrop, { backgroundColor: `${palette.background}cc` }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderStrong,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Batalha do módulo</Text>
              <Pressable
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                onPress={() => setOpen(false)}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={palette.text}
                />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryHeaderCopy}>
                    <Text style={[styles.summaryEyebrow, { color: palette.textSubtle }]}>
                      {scopeLabel}
                    </Text>
                    <Text style={[styles.summaryTitle, { color: palette.text }]}>
                      {battleState?.defeated ? "Boss derrotado" : "Confronto em andamento"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryBadge,
                      {
                        backgroundColor: battleState?.defeated
                          ? palette.accentMuted
                          : palette.surfaceElevated,
                        borderColor: battleState?.defeated
                          ? palette.borderStrong
                          : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.summaryBadgeText,
                        {
                          color: battleState?.defeated
                            ? palette.accentStrong
                            : palette.textMuted,
                        },
                      ]}
                    >
                      {battleStatusLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <BattleMetaStat
                    label="Início"
                    value={startedAtLabel}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                  <BattleMetaStat
                    label="Termino"
                    value={defeatedAtLabel}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                  <BattleMetaStat
                    label="Duracao"
                    value={durationLabel}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                  <BattleMetaStat
                    label="Tempo do encontro"
                    value={encounterLimitLabel}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                  <BattleMetaStat
                    label="Ultimo impacto"
                    value={lastDamageAtLabel}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                  <BattleMetaStat
                    label="Dano total"
                    value={`${Math.max(0, Number(battleState?.totalDamage ?? 0))}`}
                    borderColor={palette.border}
                    backgroundColor={palette.surfaceElevated}
                    labelColor={palette.textSubtle}
                    valueColor={palette.text}
                  />
                </View>
              </View>

              <IABattlePanel scope={battleScope} surface="inline" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  avatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  statusLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
  },
  hpTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  hpFill: {
    height: "100%",
    borderRadius: 999,
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    maxHeight: "86%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  modalContent: {
    gap: 12,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  summaryEyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  summaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  summaryBadgeText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaStat: {
    width: "48%",
    minWidth: 132,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metaStatLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaStatValue: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
