import { IButton } from "@/interfaces/componentes_simples/IButton";
import { Border, BoxShadow, Color, FontFamily, FontSize } from "@/styles/GlobalStyle";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

const ButtonInicial = ({text}:IButton) => {

  	return (
      			<View style={styles.view}>
        				<View style={[styles.property1default, styles.property1defaultLayout]}>
          					<View style={[styles.logInButton, styles.logInButtonPosition]}>
            						<View style={[styles.logInButtonChild, styles.logPosition]} />
          					</View>
          					<View style={styles.jTenhoContaWrapper}>
            						<Text style={[styles.jTenhoConta, styles.logInButtonPosition]}>{text}</Text>
          					</View>
        				</View>
        				<View style={[styles.property1variant2, styles.property1defaultLayout]}>
          					<View style={[styles.logInButton, styles.logInButtonPosition]}>
            						<View style={[styles.logInButtonItem, styles.logPosition]} />
          					</View>
          					<View style={styles.jTenhoContaWrapper}>
            						<Text style={[styles.jTenhoConta, styles.logInButtonPosition]}>{text}</Text>
          					</View>
        				</View>
      			</View>
    		);
};

const styles = StyleSheet.create({
  	parent: {
    		flex: 1
  	},
  	property1defaultLayout: {
    		height: 57,
    		width: 295,
    		left: 20,
    		position: "absolute"
  	},
  	logInButtonPosition: {
    		left: "0%",
    		top: "0%",
    		height: "100%",
    		position: "absolute",
    		width: "100%"
  	},
  	logPosition: {
    		borderWidth: 3,
    		borderStyle: "solid",
    		borderRadius: Border.br_4,
    		elevation: 8,
    		boxShadow: BoxShadow.shadow_drop1,
    		left: "0%",
    		bottom: "0%",
    		right: "0%",
    		top: "0%",
    		height: "100%",
    		position: "absolute",
    		width: "100%"
  	},
  	view: {
    		borderStyle: "dashed",
    		borderColor: Color.colorBlueviolet100,
    		borderWidth: 1,
    		height: 174,
    		overflow: "hidden",
    		width: "100%"
  	},
  	property1default: {
    		top: 20
  	},
  	logInButton: {
    		boxShadow: BoxShadow.shadow_drop,
    		elevation: 9,
    		bottom: "0%",
    		right: "0%",
    		left: "0%",
    		top: "0%",
    		height: "100%"
  	},
  	logInButtonChild: {
    		backgroundColor: Color.colorMidnightblue100,
    		borderColor: Color.colorBlueviolet200
  	},
  	jTenhoContaWrapper: {
    		height: "42.11%",
    		width: "58.64%",
    		top: "29.82%",
    		right: "20.68%",
    		bottom: "28.07%",
    		left: "20.68%",
    		position: "absolute"
  	},
  	jTenhoConta: {
    		fontSize: FontSize.fs_18,
    		fontWeight: "700",
    		fontFamily: FontFamily.inikaBold,
    		color: Color.colorAliceblue,
    		textAlign: "center",
    		display: "flex",
    		alignItems: "center",
    		justifyContent: "center",
    		left: "0%",
    		top: "0%",
    		height: "100%"
  	},
  	property1variant2: {
    		top: 97
  	},
  	logInButtonItem: {
    		backgroundColor: Color.colorDarkslateblue,
    		borderColor: Color.colorMidnightblue200
  	}
});

export default ButtonInicial;
