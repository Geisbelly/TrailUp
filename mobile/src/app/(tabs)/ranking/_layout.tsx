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
            headerTintColor: palette.text,
            headerTitleStyle: { color: palette.text },
            contentStyle: { backgroundColor: palette.background },
          }}
        >
            <Stack.Screen name="index" options={{ title: "Ranking", headerShown: false }} />
            <Stack.Screen name="[id]" options={{ title: "Ranking" }} />
        </Stack>
    )
}
