import React from "react";
import { Image, StyleSheet } from "react-native";

export function ImagemBlock({ payload }: { payload: { url: string } }) {
  return (
    <Image
      source={{ uri: payload.url }}
      style={styles.image}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: 200,
  },
});
