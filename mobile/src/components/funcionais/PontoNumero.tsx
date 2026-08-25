import { Color, FontFamily } from "@/styles/GlobalStyle";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  numero: number;
  size?: number; // tamanho opcional do container (em pixels)
};

const PontoNumero = ({ numero, size = 50 }: Props) => {
  // size controla o tamanho máximo do diamante
  const tamanhoContainer = size;
  const tamanhoExterno = tamanhoContainer * 0.68;
  const tamanhoInterno = tamanhoContainer * 0.55;
  const fontSize = tamanhoContainer * 0.28;

  return (
    <View style={[styles.container, { width: tamanhoContainer, height: tamanhoContainer }]}>
      <View
        style={[
          styles.diamanteExterno,
          { width: tamanhoExterno, height: tamanhoExterno },
        ]}
      />
      <View
        style={[
          styles.diamanteInterno,
          { width: tamanhoInterno, height: tamanhoInterno },
        ]}
      />
      <Text style={[styles.numero, { fontSize }]}>{numero}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf:'center'
  },

  diamanteExterno: {
    position: "absolute",
    backgroundColor: Color.colorAliceblue,
    transform: [{ rotate: "45deg" }],
    borderRadius: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 4,
  },

  diamanteInterno: {
    position: "absolute",
    backgroundColor: Color.colorGray,
    transform: [{ rotate: "45deg" }],
    borderRadius: 4,
  },

  numero: {
    fontWeight: "700",
    fontFamily: FontFamily.inikaBold,
    color: Color.colorAliceblue,
    textAlign: "center",
  },
});

export default PontoNumero;
