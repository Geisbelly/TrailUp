import React from "react";
import {
    Image,
    StyleSheet,
    View,
    Platform,
} from "react-native";
import { shadowStyle } from "@/utils/webShadow";

const IS_WEB = Platform.OS === "web";
const SOMBRA_OVERLAY = { offset: { width: 0, height: 0 }, opacity: 0.5, radius: 20 };

type Props = {
  /** Cor de destaque do perfil BrainHex ativo (ex.: profilePalette.accent). */
  tintColor?: string;
};

export const ImagemFilter = ({ tintColor = "#4a4dff" }: Props) => {


  return (

    <View style={styles.emptyImageWrap}>
        <Image
        source={require("@/assets/ImagensReferencia/gato.png")}
        style={styles.emptyImage}
        resizeMode="contain"
        />
        {/* overlay luminoso na cor do perfil ativo */}
        <View
          style={[
            styles.emptyImageOverlay,
            { backgroundColor: `${tintColor}4f`, ...shadowStyle({ ...SOMBRA_OVERLAY, color: tintColor }, IS_WEB) },
          ]}
        />
    </View>

  );
}



const styles = StyleSheet.create({

  emptyImageWrap: {
    width: 220,           // um pouco maior, como no Figma
    height: 220,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyImage: {
    width: "100%",
    height: "100%",
    filter: 'grayscale(1)',

  },

  // filtro de luminosidade na cor do perfil (overlay)
  emptyImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    // "glow" suave:
    ...shadowStyle(SOMBRA_OVERLAY, IS_WEB),
    // Android:
    elevation: 6,
  },




});
