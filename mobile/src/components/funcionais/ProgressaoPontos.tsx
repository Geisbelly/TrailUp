import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import BarraProgresso from "./BarraProgresso";
import MetaXp from "./MetaXp";
import PontoNumero from "./PontoNumero";

type Props = {
  meta: number;
  xp: number;
  nivel: number;
  pontoSize?: number; // opcional, tamanho do PontoNumero
};

const ProgressoPontos = ({ meta, xp, nivel, pontoSize = 50 }: Props) => {
  const [pontos, setPontos] = useState<number>(0);

  useEffect(() => {
    setPontos(Math.min(xp / meta, 1));
  }, [xp, meta]);

  return (
    <View style={styles.container}>
      <PontoNumero numero={nivel} size={pontoSize} />
      <View style={styles.detalhes}>
        <BarraProgresso progresso={pontos} />
        <MetaXp meta={meta} xp={xp} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8, // espaço entre ponto e barra
    flex:1,
  },
  detalhes: {
    flex: 1,
    justifyContent: "center",
    alignItems: "baseline",
    gap:2
    
  },
});

export default ProgressoPontos;
