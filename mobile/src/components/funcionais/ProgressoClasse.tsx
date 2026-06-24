import { FontFamily } from "@/styles/GlobalStyle";
import React from "react";
import { StyleSheet, Text, View , DimensionValue } from "react-native";


type Props = {
  nome: string;
  progresso: number; // valor entre 0 e 1
  width?: DimensionValue; // opcional para controlar largura
};

const ProgressoClasse = ({ nome, progresso, width = '100%' }: Props) => {
  const progressoPercentual = Math.min(Math.max(progresso, 0), 1) * 100;

  return (
    <View style={[styles.container, { width }]}>
      <View style={styles.card}>
        <Text style={styles.nome}>{nome}</Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressFill, { width: `${progressoPercentual}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
    marginVertical: 4,
    
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#5D0579",
    borderWidth: 1.2,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  nome: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FontFamily.inikaBold,
    color: "#5D0579",
    textAlign: "center",
    width: "100%",
  },
  progressBarContainer: {
    width: "100%",
    height: 6, // barra levemente maior para visibilidade
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#9122B3",
    borderRadius: 4,
  },
});

export default ProgressoClasse;
