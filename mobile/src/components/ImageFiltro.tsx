import React from "react";
import {
    Image,
    StyleSheet,
    View
} from "react-native";


export const ImagemFilter = () => {


  return (

    <View style={styles.emptyImageWrap}>
        <Image
        source={require("@/assets/ImagensReferencia/gato.png")}
        style={styles.emptyImage}
        resizeMode="contain"
        />
        {/* overlay azul luminoso */}
        <View style={styles.emptyImageOverlayBlue} />
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

  // 🔵 filtro de luminosidade azul (overlay)
  emptyImageOverlayBlue: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 10, 73, 0.31)", // azul com ~35% opacidade
    borderRadius: 999,
    // “glow” suave:
    shadowColor: "#4a4dffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    // Android:
    elevation: 6,
  },




});
