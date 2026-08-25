import { OrnamentDivider } from "@/components/HallTheme";
import { FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

interface ConquistaModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  date?: string | Date;
  color: string;
  imageSource: ImageSourcePropType;
  buttonText?: string;
  category?: string;
}

function withAlpha(color: string, alphaHex: string) {
  const normalized = String(color).trim();
  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) return `${normalized.slice(0, 7)}${alphaHex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return `${normalized}${alphaHex}`;
  return normalized;
}

export default function ConquistaModal({
  visible,
  onClose,
  title,
  description,
  date,
  color,
  imageSource,
  buttonText = "Fechar",
  category,
}: ConquistaModalProps) {
  const palette = buildProfileShellPaletteFromAccent(color);
  const gold = tinycolor(color).lighten(10).toHexString();
  const goldDim = tinycolor(color).setAlpha(0.5).toRgbString();
  const goldFaint = tinycolor(color).setAlpha(0.1).toRgbString();
  const borderColor = tinycolor(color).setAlpha(0.38).toRgbString();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        {/* Overlay com padrão de losangos simulado via gradientes */}
        <View style={[s.modalOverlay, { backgroundColor: `${palette.background}ec` }]}>

          {/* Luz de candelabro no centro do overlay */}
          <LinearGradient
            colors={[
              tinycolor(color).setAlpha(0.18).toRgbString(),
              "transparent",
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                s.modalCard,
                { backgroundColor: palette.surfaceElevated, borderColor },
              ]}
            >
              {/* Borda interna ornamental */}
              <View
                style={[
                  s.innerBorder,
                  { borderColor: tinycolor(color).setAlpha(0.18).toRgbString() },
                ]}
              />

              {/* Cantos ornamentais */}
              <View style={[s.corner, s.cornerTL, { borderColor: gold }]} />
              <View style={[s.corner, s.cornerTR, { borderColor: gold }]} />
              <View style={[s.corner, s.cornerBL, { borderColor: gold }]} />
              <View style={[s.corner, s.cornerBR, { borderColor: gold }]} />

              {/* Ícone com glow */}
              <View style={s.modalGlowContainer}>
                <LinearGradient
                  colors={[tinycolor(color).setAlpha(0.4).toRgbString(), "transparent"]}
                  style={s.modalGlow}
                />
                <View
                  style={[
                    s.modalIconWrapper,
                    { borderColor: goldDim, backgroundColor: goldFaint },
                  ]}
                >
                  <Image source={imageSource} style={s.modalImage} resizeMode="cover" />
                </View>
              </View>

              {/* Categoria badge */}
              {category && (
                <View
                  style={[
                    s.categoryBadge,
                    { borderColor: goldDim, backgroundColor: goldFaint },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="fleur-de-lis"
                    size={10}
                    color={gold}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[s.categoryText, { color: gold }]}>
                    {category.toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Título */}
              <Text
                style={[
                  s.modalTitle,
                  {
                    color: gold,
                    textShadowColor: "rgba(0,0,0,0.8)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 6,
                  },
                ]}
              >
                {title}
              </Text>

              {/* Ornamento divisor */}
              <View style={{ width: "100%", opacity: 0.7 }}>
                <OrnamentDivider color={gold} />
              </View>

              {/* Descrição */}
              <Text style={[s.modalDesc, { color: palette.textMuted }]}>{description}</Text>

              {/* Data */}
              {date && (
                <View
                  style={[
                    s.modalDateContainer,
                    { backgroundColor: goldFaint, borderColor: goldDim },
                  ]}
                >
                  <Feather name="calendar" size={14} color={goldDim} style={{ marginRight: 6 }} />
                  <Text style={[s.modalDate, { color: palette.textSubtle }]}>
                    Conquistado em {new Date(date).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
              )}

              {/* Botão fechar */}
              <TouchableOpacity
                style={[
                  s.modalCloseBtn,
                  { backgroundColor: tinycolor(color).darken(5).toHexString(), borderColor: goldDim },
                ]}
                onPress={onClose}
              >
                <Text style={[s.modalCloseText, { color: "#FFF" }]}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const CORNER_SIZE = 14;
const CORNER_OFFSET = 8;

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
    overflow: "hidden",
    gap: 10,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    margin: 4,
    borderWidth: 1,
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    opacity: 0.65,
  },
  cornerTL: { top: CORNER_OFFSET, left: CORNER_OFFSET, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: CORNER_OFFSET, right: CORNER_OFFSET, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  cornerBL: { bottom: CORNER_OFFSET, left: CORNER_OFFSET, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  cornerBR: { bottom: CORNER_OFFSET, right: CORNER_OFFSET, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  modalGlowContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  modalGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    opacity: 0.25,
  },
  modalIconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
  },
  modalImage: {
    width: "100%",
    height: "100%",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  modalTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  modalDesc: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  modalDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  modalDate: {
    fontSize: 12,
    fontFamily: FontFamily.interMedium,
  },
  modalCloseBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1.5,
    marginTop: 4,
  },
  modalCloseText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
