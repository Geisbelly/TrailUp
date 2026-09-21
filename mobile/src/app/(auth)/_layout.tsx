import { Tabs } from 'expo-router';

export default function TabLayout() {
  // O layout raiz controla a sessão e o destino após o login.

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarStyle: {
          display: 'none', // mantido invisível por enquanto
        },
        
      }}
      
    />
  );
}
