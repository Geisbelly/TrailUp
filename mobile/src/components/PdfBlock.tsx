import { Color } from "@/styles/GlobalStyle";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

const webFrameStyle = {
  width: "100%",
  height: 360,
  border: "none",
};

export function PdfBlock({ payload }: { payload: { url: string } }) {
  return (
    <View style={styles.pdfBox}>
      {Platform.OS === "web" ? (
        <iframe src={payload.url} style={webFrameStyle} />
      ) : (
        <WebView source={{ uri: payload.url }} style={styles.pdfWebview} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pdfBox: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  pdfWebview: {
    width: "100%",
    height: 360,
  },
});
