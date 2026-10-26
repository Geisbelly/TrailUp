import { IButton } from "@/interfaces/componentes_simples/IButton";
import { Border, Color, FontFamily, FontSize } from "@/styles/GlobalStyle";
import { StyleSheet, Text, TouchableOpacity, Platform } from "react-native";
import { shadowStyle } from "@/utils/webShadow";

const IS_WEB = Platform.OS === "web";

const ButtonG = ({ text, variant = "primary" }: IButton) => {
  const backgroundColor =
    variant === "primary" ? Color.colorBlueviolet200 : Color.colorMidnightblue200;

  return (
    <TouchableOpacity activeOpacity={0.8} style={[styles.button, { backgroundColor }]}>
      <Text style={styles.text}>{text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 57,
    width: "90%",
    marginVertical: 10,
    alignSelf: "center",
    borderRadius: Border.br_4,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5, // Android
    ...shadowStyle({ color: "#000", offset: { width: 0, height: 2 }, opacity: 0.2, radius: 3 }, IS_WEB),
  },
  text: {
    fontSize: FontSize.fs_18,
    fontWeight: "700",
    fontFamily: FontFamily.inikaBold,
    color: Color.colorAliceblue,
    textAlign: "center",
  },
});

export default ButtonG;
