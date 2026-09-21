import { app } from '@/constants/definicoes';
import { designStar, publicScenery } from '@/constants/designAssets';
import { FontFamily } from '@/styles/GlobalStyle';
import { Design } from '@/styles/design';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Entrada() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <Image source={publicScenery} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
      <LinearGradient colors={['rgba(23,14,43,0.08)', 'rgba(23,14,43,0.3)', Design.ink]} locations={[0, 0.45, 0.82]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <Image source={designStar} style={styles.mark} resizeMode="contain" accessible={false} />
            <Text style={styles.name}>{app.name}</Text>
          </View>
          <View style={styles.scene} />
          <View style={styles.actions}>
            <Text style={styles.title}>Sua próxima conquista começa aqui.</Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => router.replace('/(auth)/tela')}
              accessibilityRole="button"
              accessibilityLabel="Já tenho conta"
            >
              <Text style={styles.primaryText}>Já tenho conta</Text>
              <MaterialCommunityIcons name="arrow-right" size={22} color={Design.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => Linking.openURL(app.siteCadastro)}
              accessibilityRole="link"
              accessibilityLabel="Criar conta"
            >
              <MaterialCommunityIcons name="account-plus-outline" size={20} color={Design.primary} />
              <Text style={styles.secondaryText}>Criar conta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Design.ink },
  safe: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: 24, paddingBottom: 32 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 12 },
  mark: { width: 40, height: 40 },
  name: { fontFamily: FontFamily.inikaBold, fontSize: 38, color: Design.text, fontWeight: '700', letterSpacing: 0 },
  scene: { flex: 1, minHeight: 260 },
  actions: { width: '100%', gap: 12 },
  title: { fontFamily: FontFamily.inikaBold, color: Design.text, fontSize: 25, lineHeight: 33, textAlign: 'center', marginBottom: 12 },
  primary: { minHeight: 56, padding: 16, borderRadius: Design.radius, backgroundColor: Design.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  secondary: { minHeight: 54, padding: 16, borderRadius: Design.radius, borderWidth: 1, borderColor: Design.borderStrong, backgroundColor: Design.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: '700', color: Design.ink },
  secondaryText: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: '600', color: Design.primary },
});
