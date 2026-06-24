import {
  Corner,
  HallBackground,
  OrnamentDivider,
} from "@/components/HallTheme";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const PADDING_H = 20;
const GAP = 14;
const CARD_W = (SCREEN_W - PADDING_H * 2 - GAP) / 2;
const CARD_H = CARD_W * 1.48;

const rankIconMap: Record<number, any> = {
  1: require("@/assets/icones/rank/2.png"),
  2: require("@/assets/icones/rank/4.png"),
  3: require("@/assets/icones/rank/1.png"),
  4: require("@/assets/icones/rank/3.png"),
};

type RankCardItem = { id: number; nome: string; icone?: number | null };
type Palette = ReturnType<typeof getProfileShellPalette>;

// ─── RankCard ─────────────────────────────────────────────────────────────────
function RankCard({
  item,
  isFullWidth,
  palette,
}: {
  item: RankCardItem;
  isFullWidth: boolean;
  palette: Palette;
}) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.5).toRgbString();
  const goldFaint = tinycolor(palette.accent).setAlpha(0.13).toRgbString();

  const cardTop = tinycolor
    .mix(palette.surfaceElevated, palette.accent, 22)
    .toRgbString();
  const cardMid = tinycolor
    .mix(palette.surface, palette.accent, 8)
    .toRgbString();
  const cardBot = tinycolor
    .mix(palette.background, palette.surface, 40)
    .toRgbString();

  const iconSource = (item.icone && rankIconMap[item.icone]) || rankIconMap[1];

  const handlePress = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1.04,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
        router.push({
          pathname: "/(tabs)/ranking/[id]",
          params: { id: item.id },
        });
      }, 90);
    });
  };

  if (isFullWidth) {
    return (
      <Animated.View
        style={{ transform: [{ scale: scaleAnim }], width: "100%" }}
      >
        <Pressable onPress={handlePress}>
          <LinearGradient
            colors={[cardTop, cardMid, cardBot]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.cardFull]}
          >
            {/* Bordas ornamentadas */}
            <View
              style={[styles.outerBorder, { borderColor: Color.colorwhite50 }]}
            />
            <View
              style={[
                styles.innerBorder,
                {
                  borderColor: tinycolor(palette.accent)
                    .setAlpha(0.22)
                    .toRgbString(),
                },
              ]}
            />
            {/* Cantos */}
            <Corner pos="TL" color={Color.colorwhite50} />
            <Corner pos="TR" color={Color.colorwhite50} />
            <Corner pos="BL" color={Color.colorwhite50} />
            <Corner pos="BR" color={Color.colorwhite50} />

            {/* Shimmer */}
            <Animated.View style={[styles.shimmer, { opacity: shimmerAnim }]}>
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(255,255,255,0.28)",
                  "transparent",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Ícone com moldura circular */}
            <View
              style={[
                styles.medalCircleFull,
                { borderColor: goldDim, backgroundColor: goldFaint },
              ]}
            >
              <Image
                source={iconSource}
                style={styles.iconFull}
                resizeMode="contain"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.rankLabelFull, { color: Color.colorWhite }]}>
                {item.nome ? item.nome.toUpperCase() : "RANK"}
              </Text>
              <Text
                style={[
                  styles.rankSubFull,
                  {
                    color: tinycolor(palette.text).setAlpha(0.55).toRgbString(),
                  },
                ]}
              >
                Categoria de honra
              </Text>
            </View>

            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={Color.colorWhite20}
            />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: CARD_W }}>
      <Pressable onPress={handlePress}>
        <LinearGradient
          colors={[cardTop, cardMid, cardBot]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.card, { height: CARD_H }]}
        >
          {/* Bordas ornamentadas */}
          <View
            style={[styles.outerBorder, { borderColor: Color.colorwhite50 }]}
          />
          <View
            style={[
              styles.innerBorder,
              {
                borderColor: tinycolor(palette.accent)
                  .setAlpha(0.22)
                  .toRgbString(),
              },
            ]}
          />

          {/* Cantos */}
          <Corner pos="TL" color={Color.colorwhite50} />
          <Corner pos="TR" color={Color.colorwhite50} />
          <Corner pos="BL" color={Color.colorwhite50} />
          <Corner pos="BR" color={Color.colorwhite50} />

          {/* Shimmer no press */}
          <Animated.View style={[styles.shimmer, { opacity: shimmerAnim }]}>
            <LinearGradient
              colors={["transparent", "rgba(255,255,255,0.26)", "transparent"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Glow de fundo atrás do ícone */}
          <View style={[styles.iconGlowBg, { backgroundColor: goldFaint }]} />

          {/* Ícone com moldura escudo */}
          <View
            style={[
              styles.medalCircle,
              { borderColor: goldDim, backgroundColor: goldFaint },
            ]}
          >
            <Image
              source={iconSource}
              style={styles.icon}
              resizeMode="contain"
            />
          </View>

          {/* Separador decorativo */}
          <View style={styles.separator}>
            <View
              style={[styles.sepLine, { backgroundColor: Color.colorwhite50 }]}
            />
            <MaterialCommunityIcons
              name="rhombus"
              size={6}
              color={Color.colorwhite50}
            />
            <View
              style={[styles.sepLine, { backgroundColor: Color.colorwhite50 }]}
            />
          </View>

          {/* Nome do rank */}
          <Text
            style={[styles.rankLabel, { color: Color.colorWhite }]}
            numberOfLines={2}
          >
            {item.nome ? item.nome.toUpperCase() : "RANK"}
          </Text>

          {/* Badge de "Entrar" */}
          <View
            style={[
              styles.enterBadge,
              {
                borderColor: tinycolor(Color.colorwhite50)
                  .setAlpha(0.35)
                  .toRgbString(),
              },
            ]}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={12}
              color={Color.colorwhite50}
            />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function RankingHome() {
  const { ranking } = useConquistaRank();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.55).toRgbString();
  const goldFaint = tinycolor(palette.accent).setAlpha(0.08).toRgbString();

  // Pulsação do ícone do topo
  const crownPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(crownPulse, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(crownPulse, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [crownPulse]);
  const crownScale = crownPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.07],
  });
  const crownOpacity = crownPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const data: RankCardItem[] = useMemo(
    () =>
      (ranking?.ranks ?? []).map((r: any) => ({
        id: r.info.rank_id,
        nome: r.info.nome_rank,
        icone: Number((r.info as any)?.icone ?? 0) || undefined,
      })),
    [ranking],
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {/* ── Fundo do salão ── */}
      <HallBackground palette={palette} />

      {/* ── Gradiente topo (candelabro) ── */}
      <LinearGradient
        colors={[
          tinycolor(palette.accent).setAlpha(0.22).toRgbString(),
          tinycolor(palette.accent).setAlpha(0.06).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: SCREEN_H * 0.42 }]}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ══════════ HEADER DO SALÃO ══════════ */}
          <View style={styles.header}>
            {/* Ícone animado do topo */}
            <Animated.View
              style={{
                transform: [{ scale: crownScale }],
                opacity: crownOpacity,
              }}
            >
              <MaterialCommunityIcons
                name="shield-crown"
                size={56}
                color={Color.colorWhite}
              />
            </Animated.View>

            {/* Título */}
            <Text style={[styles.title, { color: Color.colorWhite }]}>
              SALA DE HONRA
            </Text>
            <Text style={[styles.titleSub, { color: palette.text }]}>
              Quadro de Classificações
            </Text>

            {/* Ornamento */}
            <OrnamentDivider color={Color.colorWhite} />

            {/* Subtítulo descritivo */}
            <Text
              style={[
                styles.subtitle,
                { color: tinycolor(palette.text).setAlpha(0.52).toRgbString() },
              ]}
            >
              Escolha uma categoria e descubra sua posição entre os melhores
            </Text>
          </View>

          {/* ══════════ GRADE DE CARDS ══════════ */}
          <View style={styles.grid}>
            {data.map((item, index) => {
              const isLastItem = index === data.length - 1;
              const isTotalOdd = data.length % 2 !== 0;
              const isFullWidth = isLastItem && isTotalOdd;
              return (
                <RankCard
                  key={item.id}
                  item={item}
                  isFullWidth={isFullWidth}
                  palette={palette}
                />
              );
            })}
          </View>

          {/* ── Ornamento de rodapé ── */}
          <View style={{ marginTop: 32, opacity: 0.4 }}>
            <OrnamentDivider color={Color.colorWhite} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scroll: {
    paddingHorizontal: PADDING_H,
    paddingTop: 24,
    paddingBottom: 110,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 32,
    gap: 6,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 26,
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginTop: 8,
  },
  titleSub: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 4,
    paddingHorizontal: 12,
  },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: GAP,
  },

  // Card normal (portrait)
  card: {
    borderRadius: 18,
    padding: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  outerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
    opacity: 0.65,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    margin: 4,
    borderWidth: 1,
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    overflow: "hidden",
  },
  iconGlowBg: {
    position: "absolute",
    top: "18%",
    width: CARD_W * 0.55,
    height: CARD_W * 0.55,
    borderRadius: CARD_W * 0.28,
  },
  medalCircle: {
    width: CARD_W * 0.58,
    height: CARD_W * 0.58,
    borderRadius: CARD_W * 0.29,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  icon: {
    width: "80%",
    height: "80%",
  },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    width: "70%",
    gap: 4,
  },
  sepLine: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  rankLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  enterBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.7,
  },

  // Card full-width (landscape)
  cardFull: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
    marginBottom: 4,
  },
  medalCircleFull: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconFull: {
    width: "76%",
    height: "76%",
  },
  rankLabelFull: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  rankSubFull: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    marginTop: 2,
  },
});
