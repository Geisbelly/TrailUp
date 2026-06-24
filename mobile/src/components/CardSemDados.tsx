import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ImagemFilter } from "./ImageFiltro";

type Props = {
  title: string;
  description?: string;
};

const CardSemDados: React.FC<Props> = React.memo(({ title, description = "" }) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <ImagemFilter />
      <Text style={styles.emptyText}>{description}</Text>
    </View>
  );
});

CardSemDados.displayName = "CardSemDados";

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    minHeight: "100%",
    paddingHorizontal: 1,
    gap: 14,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
});

export default CardSemDados;
