import { IButton } from "@/interfaces/componentes_simples/IButton";
import { Border, Color, FontFamily, FontSize } from "@/styles/GlobalStyle";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

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
    shadowColor: "#000", // iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
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
