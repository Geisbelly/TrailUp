import { OrnamentDivider } from "@/components/HallTheme";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

/** "perfil_brainhex" -> "Perfil BrainHex": a categoria vem do banco em snake_case. */
function rotuloCategoria(categoria: string) {
  const texto = categoria
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((parte) => (parte.toLowerCase() === "brainhex" ? "BrainHex" : parte.toLowerCase()))
    .join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

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
  profile?: string | null;
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
  // Web em tela larga (#346, protótipo v4): card arredondado com brilho atrás da arte,
  // "CONQUISTA DESBLOQUEADA", data por extenso e botão em pílula.
  const desktop = useDesktopWeb();

  if (desktop) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Fechar">
          <View style={[s.modalOverlay, s.fundoLargo]}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                accessibilityViewIsModal
                style={[
                  s.cardLargo,
                  { backgroundColor: palette.surfaceElevated, borderColor: palette.accent, shadowColor: palette.accent },
                ]}
              >
                <View style={s.arteLarga}>
                  <View style={[s.brilhoLargo, { backgroundColor: goldFaint, shadowColor: palette.accent }]} />
                  <Image source={imageSource} resizeMode="contain" style={s.imagemLarga} accessibilityLabel={title} />
                </View>
                {category ? (
                  <View style={[s.categoriaLarga, { backgroundColor: palette.accentMuted }]}>
                    <Text style={[s.categoriaLargaTexto, { color: palette.accent }]}>{rotuloCategoria(category)}</Text>
                  </View>
                ) : null}
                <Text style={[s.sobretituloLargo, { color: palette.text }]}>CONQUISTA DESBLOQUEADA</Text>
                <Text accessibilityRole="header" style={[s.tituloLargo, { color: palette.accent }]}>
                  {title}
                </Text>
                <Text style={[s.descricaoLarga, { color: palette.text }]}>{description}</Text>
                {date ? (
                  <Text style={[s.dataLarga, { color: palette.textMuted }]}>
                    Conquistada em {new Date(date).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[s.botaoLargo, { backgroundColor: palette.accent, borderColor: palette.borderStrong }]}
                  onPress={onClose}
                  accessibilityRole="button"
                >
                  <Text style={[s.botaoLargoTexto, { color: palette.background }]}>{buttonText}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  }

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
            style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
          />

          <TouchableWithoutFeedback onPress={() => {}}>
            <ScrollView
              style={[
                s.modalCard,
                { backgroundColor: palette.surfaceElevated, borderColor },
              ]}
              contentContainerStyle={s.modalContent}
              bounces={false}
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

              <Image source={imageSource} resizeMode="contain" style={{ width: 112, height: 112 }} accessibilityLabel={title} />

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
                accessibilityRole="button"
              >
                <Text style={[s.modalCloseText, { color: "#FFF" }]}>{buttonText}</Text>
              </TouchableOpacity>
            </ScrollView>
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
  fundoLargo: { backgroundColor: "rgba(0,0,0,0.7)" },
  cardLargo: {
    width: 420,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 26,
    alignItems: "center",
    gap: 10,
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  arteLarga: { width: 170, height: 150, alignItems: "center", justifyContent: "center" },
  brilhoLargo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  imagemLarga: { width: 120, height: 120 },
  categoriaLarga: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  categoriaLargaTexto: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700" },
  sobretituloLargo: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },
  tituloLargo: { fontFamily: FontFamily.inikaBold, fontSize: 27, textAlign: "center", marginTop: -4 },
  descricaoLarga: { fontFamily: FontFamily.interMedium, fontSize: 14.5, lineHeight: 22, textAlign: "center" },
  dataLarga: { fontFamily: FontFamily.interMedium, fontSize: 13, marginTop: 2 },
  botaoLargo: {
    marginTop: 12,
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
  },
  botaoLargoTexto: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  modalCard: {
    flexGrow: 0,
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    borderRadius: 6,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
    overflow: "hidden",
  },
  modalContent: { padding: 24, alignItems: 'center', gap: 10 },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
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

  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 10,
    letterSpacing: 0,
  },
  modalTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    textAlign: "center",
    letterSpacing: 0,
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
    borderRadius: 4,
    borderWidth: 1,
  },
  modalDate: {
    fontSize: 12,
    fontFamily: FontFamily.interMedium,
  },
  modalCloseBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1.5,
    marginTop: 4,
  },
  modalCloseText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    letterSpacing: 0,
  },
});
