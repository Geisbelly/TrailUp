import { useUsuario } from "@/context/SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { Stack } from "expo-router";

export default function PerfilStack() {
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.text },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Meu Perfil", headerShown: false }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: "Detalhes da Notificação" }}
      />
    </Stack>
  );
}
