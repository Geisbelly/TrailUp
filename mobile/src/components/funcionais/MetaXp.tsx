import { Color, FontFamily } from "@/styles/GlobalStyle";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  meta: number;
  xp: number;
};

const MetaXp = ({ meta, xp }: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>XP:</Text>
      <Text style={styles.value}>{xp}</Text>
      <Text style={styles.separator}>/</Text>
      <Text style={styles.value}>{meta}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4, // espaçamento consistente entre os elementos
  },
  label: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    fontSize: 12,
    color: Color.colorSlategray,
  },
  value: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    fontSize: 12,
    color: Color.colorSlategray,
  },
  separator: {
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    fontSize: 12,
    color: Color.colorSlategray,
  },
});

export default MetaXp;
