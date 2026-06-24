
import { Color, FontFamily } from '@/styles/GlobalStyle';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

export function TextoBlock({ payload }: { payload: string }) {
  return <Text style={styles.cardBody}>{payload}</Text>;
}

const styles = StyleSheet.create({
   cardBody: {
      marginTop: 8,
      fontFamily: FontFamily.interMedium,
      fontSize: 14,
      color: Color.colorAliceblue300,
    },
});
