import { Color } from "@/styles/GlobalStyle";
import * as React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  progresso: number; // valor entre 0 e 1
};

const BarraProgresso = ({ progresso }: Props) => {
  const progressoPercentual = Math.min(Math.max(progresso, 0), 1) * 100;

  return (
    <SafeAreaView style={styles.parent}>
      <View style={styles.container}>
        <View style={styles.fundo} />
        <View style={[styles.preenchimento, { width: `${progressoPercentual}%` }]} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  parent: {
    flex: 1,
    width: "100%",
  },
  container: {
    width: "100%",
    height: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Color.colorSlategray,
    backgroundColor: Color.colorGray,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fundo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Color.colorGray,
  },
  preenchimento: {
    height: "100%",
    backgroundColor: Color.colorAliceblue,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
});

export default BarraProgresso;
