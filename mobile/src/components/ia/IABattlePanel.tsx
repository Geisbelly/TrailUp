import { useIA } from "@/context/IAContext";
import { IABossVictoryModal } from "@/components/ia/IABossVictoryModal";
import { NADA_OBSERVADO, proximaCelebracao } from "@/utils/celebracaoDoBoss";
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

// Espelho de `_PROFILE_PRESETS` e `_PALETTES` em
// `api/app/services/behavioral_personalization.py`, que e a fonte da verdade.
// Isto so roda quando o patch chega SEM `visual` — patch abreviado, mock local,
// app ainda sem resposta da API. Ha teste do lado da API conferindo que os dois
// nao divergiram (`api/tests/test_arte_combate.py`).
//
// Cores e rotulos sao copia literal do Python, inclusive a falta de acento nos
// rotulos: o fallback tem de ser indistinguivel do que a API manda, e nao uma
// segunda versao "melhorada" que faz o boss mudar de cara conforme o patch
// chegou ou nao.
//
// Sem URL de arte de proposito: quem monta URL e o catalogo da API
// (`app/services/arte_combate.py`), que conhece a base publica. O app nao.
const BOSS_PRESETS: Record<string, IAEnemyVisualSpec> = {
  // Conqueror: O Tirano da Arena
  arena: {
    preset: "arena",
    badgeLabel: "Tirano",
    palette: {
      primaryColor: "#d24c33",
      secondaryColor: "#4f1710",
      accentColor: "#ffd27d",
      hpColor: "#ff5d5d",
      shieldColor: "#94f7c5",
      textColor: "#fff8f2",
    },
  },
  // Achiever: O Usurpador de Ouro
  duelist: {
    preset: "duelist",
    badgeLabel: "Rival",
    palette: {
      primaryColor: "#7a2137",
      secondaryColor: "#221019",
      accentColor: "#ffd166",
      hpColor: "#ff6b6b",
      shieldColor: "#93efcf",
      textColor: "#fff7f7",
    },
  },
  // Mastermind: O Marionetista Frio
  oracle: {
    preset: "oracle",
    badgeLabel: "Mente Sombria",
    palette: {
      primaryColor: "#355b68",
      secondaryColor: "#101b22",
      accentColor: "#d7f171",
      hpColor: "#f46d75",
      shieldColor: "#81f2df",
      textColor: "#f2fffb",
    },
  },
  // Socialiser: O Demagogo de Ferro
  parade: {
    preset: "parade",
    badgeLabel: "Demagogo",
    palette: {
      primaryColor: "#7a2f58",
      secondaryColor: "#24111d",
      accentColor: "#ffd57a",
      hpColor: "#ff7b7b",
      shieldColor: "#83efdf",
      textColor: "#f8fbff",
    },
  },
  // Daredevil: O Sabotador do Rift
  rift: {
    preset: "rift",
    badgeLabel: "Sabotador",
    palette: {
      primaryColor: "#dd6b20",
      secondaryColor: "#5a250a",
      accentColor: "#ffe08a",
      hpColor: "#ff6d61",
      shieldColor: "#8bf2b7",
      textColor: "#fff8ef",
    },
  },
  // Survivor: O Perseguidor Escarlate
  sentinel: {
    preset: "sentinel",
    badgeLabel: "Ameaca",
    palette: {
      primaryColor: "#7d1d30",
      secondaryColor: "#240913",
      accentColor: "#f5b173",
      hpColor: "#ff7b7b",
      shieldColor: "#75d7c8",
      textColor: "#fff3f1",
    },
  },
  // Seeker: A Entidade do Vazio
  veil: {
    preset: "veil",
    badgeLabel: "Abismo",
    palette: {
      primaryColor: "#4e3286",
      secondaryColor: "#171225",
      accentColor: "#8fe5ff",
      hpColor: "#ff7f90",
      shieldColor: "#74f0d3",
      textColor: "#f6f7ff",
    },
  },
};

// `archetype` e o que viaja no patch; `preset` nomeia o visual. A API manda os
// dois, e os vocabularios sao diferentes de proposito.
//
// Antes desta tabela o casamento era por substring (`includes("mech")`,
// `includes("beast")`), e NENHUM dos sete archetypes da API casava: todo boss
// caia no default laranja, qualquer que fosse o perfil do aluno.
const PRESET_POR_ARCHETYPE: Record<string, string> = {
  "arena-tyrant": "arena",
  "fallen-usurper": "duelist",
  "shadow-puppeteer": "oracle",
  "toxic-demagogue": "parade",
  "chaos-saboteur": "rift",
  "night-stalker": "sentinel",
  "void-entity": "veil",
};

// Archetype desconhecido: o mock local de `IAContext`, ou um patch de versao
// futura. As cores sao as mesmas de `mergePalette`, entao nao ha salto visual
// entre "sem visual nenhum" e "visual sem preset conhecido".
const VISUAL_NEUTRO: IAEnemyVisualSpec = {
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

function buildFallbackVisual(archetype?: string | null): IAEnemyVisualSpec {
  const normalized = String(archetype ?? "")
    .trim()
    .toLowerCase();
  // Aceita as duas chaves: o campo que viaja e o `archetype`, mas um patch que
  // so tenha o nome do preset tambem resolve.
  const preset = PRESET_POR_ARCHETYPE[normalized] ?? normalized;
  return BOSS_PRESETS[preset] ?? VISUAL_NEUTRO;
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

  // A CELEBRACAO dispara na TRANSICAO, nunca no estado.
  //
  // `battleState?.defeated` e o sinal de verdade: `previewState` nasce sempre
  // com `defeated: false`. E o primeiro encontro com cada boss so REGISTRA o
  // estado inicial -- sem isto, voltar a um conteudo ja concluido celebraria de
  // novo a cada abertura da tela.
  const chaveDoBoss = String(
    battleState?.itemKey ??
      (scope.scope === "item" ? scope.itemKey : `topic:${scope.topicoId}`)
  );
  const derrotadoAgora = Boolean(battleState?.defeated);
  const observacaoDoBossRef = useRef(NADA_OBSERVADO);
  const [vitoriaVisivel, setVitoriaVisivel] = useState(false);

  useEffect(() => {
    const { observacao, celebrar } = proximaCelebracao(observacaoDoBossRef.current, {
      chave: chaveDoBoss,
      derrotado: derrotadoAgora,
    });
    observacaoDoBossRef.current = observacao;
    if (celebrar) setVitoriaVisivel(true);
  }, [chaveDoBoss, derrotadoAgora]);

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
          accessibilityRole="button"
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

      {/* `Modal` do React Native desenha na camada nativa dele, entao ficar
          dentro desta `View` nao o prende ao layout do painel. */}
      <IABossVictoryModal
        visible={vitoriaVisivel}
        enemy={enemy}
        visual={visual ?? null}
        palette={palette}
        mensagem={resolvedBattle.battle.victoryMessage}
        onClose={() => setVitoriaVisivel(false)}
      />
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
