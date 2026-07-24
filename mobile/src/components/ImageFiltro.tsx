import React from "react";
import {
    Image,
    StyleSheet,
    View
} from "react-native";

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
            { backgroundColor: `${tintColor}4f`, shadowColor: tintColor },
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    // Android:
    elevation: 6,
  },




});
