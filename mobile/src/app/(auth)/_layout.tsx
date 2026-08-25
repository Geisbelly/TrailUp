import { getSessionSafe } from '@/database/supabase';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function TabLayout() {
  const router = useRouter();

  useEffect(() => {
    const verificarSessao = async () => {
      const session = await getSessionSafe();

      if (!session) {
        router.replace('/(auth)'); // redireciona se não tiver logado
      }
    };

    void verificarSessao();
  }, []);

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
