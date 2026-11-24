// Raiz dos gestos no celular: o `GestureHandlerRootView` e a carga do Reanimated, como o modelo do
// Expo pede no layout raiz. Na web vale `RaizDeGestos.web.tsx`, que não importa nenhum dos dois.
import "react-native-reanimated";

export { GestureHandlerRootView as RaizDeGestos } from "react-native-gesture-handler";
