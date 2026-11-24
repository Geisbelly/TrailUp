// Na web a raiz dos gestos é só uma `View`, como o próprio `GestureHandlerRootView.web` do
// react-native-gesture-handler: lá o detector de gestos não exige a raiz (a checagem dele pula a
// web). Importar a biblioteca aqui punha ela e o Reanimated (uns 830 KB crus, medidos no export de
// 24/11) no `__common`, baixado antes da primeira tela. A tela que usa gesto (Notificações, com o
// `Swipeable`) continua importando a biblioteca, e ela vai para o pedaço daquela rota.
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function RaizDeGestos({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return <View style={style ?? { flex: 1 }}>{children}</View>;
}
