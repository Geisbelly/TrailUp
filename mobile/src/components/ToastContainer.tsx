import { getBrainHexConfig } from '@/constants/profileImages';
import { ToastMessage, useNotifications } from '@/context/NotificacaoContext';
import { useUsuario } from '@/context/SessaoContext';
import { FontFamily } from '@/styles/GlobalStyle';
import { getProfileShellPalette } from '@/utils/profileShellTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// --- COMPONENTE 1: BANNER DE RANK (Mantido igual) ---
const RankBanner = ({
  item,
  onRemove,
  profileColor,
  palette,
}: {
  item: ToastMessage;
  onRemove: () => void;
  profileColor?: string;
  palette: ReturnType<typeof getProfileShellPalette>;
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 6 }).start();
  }, [translateY]);

  const handlePress = () => {
    if (item.onPress) item.onPress();
    onRemove();
  };

  return (
    <Animated.View style={[styles.bannerWrapper, { transform: [{ translateY }] }]}>
      <TouchableOpacity 
        style={[
          styles.bannerContainer,
          {
            borderColor: profileColor || '#FFD700',
            backgroundColor: palette.surfaceElevated,
          },
        ]}
        activeOpacity={0.8} 
        onPress={handlePress}
      >
        <View
          style={[
            styles.bannerIconContainer,
            { backgroundColor: palette.accentMuted },
          ]}
        >
          <MaterialCommunityIcons name="podium-gold" size={28} color="#FFD700" />
        </View>
        <View style={styles.bannerTextContainer}>
          <Text style={[styles.bannerTitle, { color: profileColor || '#FFD700' }]}>{item.title}</Text>
          <Text style={[styles.bannerDesc, { color: palette.textMuted }]} numberOfLines={1}>
            {item.description}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={palette.text}
          style={{ opacity: 0.5 }}
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

// --- COMPONENTE 2: MODAL FULL (Atualizado - Sem Glow) ---
const NotificationModal = ({ item, onRemove }: { item: ToastMessage; onRemove: () => void }) => {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  const { usuario } = useUsuario();
  const profileName = usuario?.perfis?.[0]?.nome || 'seeker'; 
  const profileConfig = getBrainHexConfig(profileName);
  const palette = getProfileShellPalette(profileName);

  // Configuração Visual (bgGlow removido pois não é mais usado)
  const getConfig = () => {
    switch (item.type) {
      case 'achievement':
        return {
          icon: profileConfig.icon,
          secondaryIcon: 'trophy',
          color: profileConfig.color,
          titleColor: profileConfig.color,
          btnLabel: 'INCRÍVEL!',
          isProfileThemed: true
        };
      
      case 'warning':
        return {
          icon: 'alert-outline',
          secondaryIcon: null,
          color: '#F59E0B', // Amarelo
          titleColor: '#FBBF24',
          btnLabel: 'ENTENDI',
          isProfileThemed: false
        };

      case 'error':
        return {
          icon: 'alert-octagon-outline',
          secondaryIcon: null,
          color: '#EF4444', // Vermelho
          titleColor: '#F87171',
          btnLabel: 'FECHAR',
          isProfileThemed: false
        };

      case 'success':
        return {
          icon: 'check-decagram-outline',
          secondaryIcon: null,
          color: palette.accent,
          titleColor: palette.accent,
          btnLabel: 'ÓTIMO',
          isProfileThemed: false
        };

      default: // Info
        return {
          icon: 'information-variant',
          secondaryIcon: null,
          color: palette.accent,
          titleColor: palette.accent,
          btnLabel: 'OK',
          isProfileThemed: false
        };
    }
  };

  const config = getConfig();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  const handleClose = () => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onRemove());
  };

  return (
    <View style={[styles.modalOverlay, { backgroundColor: `${palette.background}ee` }]}>
      <Animated.View
        style={[
          styles.modalCard,
          {
            opacity,
            transform: [{ scale }],
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderStrong,
          },
        ]}
      >
        
        {/* --- GLOW EFFECT REMOVIDO DAQUI --- */}

        {/* Área do Ícone (Agora centralizado e limpo) */}
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <MaterialCommunityIcons 
            name={config.icon as any} 
            size={88} // Ligeiramente maior para compensar a falta do fundo
            color={config.color} 
          />
          
          {/* Badge de conquista mantido */}
          {config.isProfileThemed && (
            <View style={[styles.badgeIcon, { backgroundColor: palette.surfaceElevated }]}>
              <MaterialCommunityIcons name="trophy" size={22} color="#FFD700" />
            </View>
          )}
        </View>

        <Text style={[styles.modalTitle, { color: config.titleColor }]}>
          {item.title}
        </Text>
        
        <View style={[styles.divider, { backgroundColor: palette.border }]} />

        <Text style={[styles.modalBody, { color: palette.textMuted }]}>{item.description}</Text>

        <TouchableOpacity 
          style={[
            styles.modalButton,
            {
              borderColor: config.color,
              backgroundColor: palette.accentMuted,
            },
          ]} 
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.modalButtonText, { color: config.color }]}>
            {config.btnLabel}
          </Text>
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
};

// --- CONTAINER PRINCIPAL ---
export function ToastContainer() {
  const { activeToasts, removeToast } = useNotifications();
  const insets = useSafeAreaInsets();
  
  const { usuario } = useUsuario();
  const profileName = usuario?.perfis?.[0]?.nome || 'seeker';
  const profileConfig = getBrainHexConfig(profileName);
  const palette = getProfileShellPalette(profileName);

  if (activeToasts.length === 0) return null;

  const activeModal = activeToasts.find(t => t.type !== 'rank');
  const activeBanners = activeToasts.filter(t => t.type === 'rank');

  return (
    <View style={[styles.rootContainer, { top: insets.top }]} pointerEvents="box-none">
      
      {activeBanners.map((toast) => (
        <RankBanner 
          key={toast.id} 
          item={toast} 
          onRemove={() => removeToast(toast.id)} 
          profileColor={profileConfig.color}
          palette={palette}
        />
      ))}

      {activeModal && (
        <Modal transparent animationType="fade" visible={true} onRequestClose={() => removeToast(activeModal.id)}>
          <NotificationModal item={activeModal} onRemove={() => removeToast(activeModal.id)} />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0, 
    zIndex: 9999,
    elevation: 100,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  // --- BANNER (Mantido) ---
  bannerWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannerContainer: {
    width: width * 0.92,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  bannerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: FontFamily.interMedium,
  },
  bannerDesc: {
    fontSize: 13,
    opacity: 0.9,
    marginTop: 2,
    fontFamily: FontFamily.interMedium,
  },

  // --- MODAL (Atualizado) ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: width * 0.85,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', // Borda sutil
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 25,
    position: 'relative',
    // overflow: 'hidden', // Removido para o badge poder sair um pouco se precisar
  },
  // glowEffect style REMOVIDO
  iconWrapper: {
    marginBottom: 24, // Espaçamento aumentado
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    // Adicionado um fundo sutil apenas para o ícone, mais elegante que o glow gigante
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)', // Muito sutil
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  badgeIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3, // Borda mais grossa para "recortar" do ícone principal
    // backgroundColor será definido no componente usando a cor do card
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: FontFamily.poppinsExtraBold, 
    letterSpacing: 0.5,
  },
  divider: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 16,
  },
  modalBody: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 32,
    fontFamily: FontFamily.interMedium,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 50,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  modalButtonText: {
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
