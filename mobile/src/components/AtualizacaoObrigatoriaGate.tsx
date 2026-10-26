import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  CHAVE_URL_ATUALIZACAO,
  CHAVE_VERSAO_MINIMA,
  lerConfigDeVersao,
  precisaAtualizar,
  urlDeAtualizacaoSegura,
} from "@/utils/versaoMinima";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import Constants from "expo-constants";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

// Tela de "atualize o app" (#195). Le `app_config.app_versao_minima` no inicio
// (linha publica: o anon le, ninguem do cliente grava). Vazia = desligada, que
// e' como a alembic 20261024_11 a cria; quem opera liga com a versao que ja'
// assina as URLs dos buckets privados ANTES de fechar os buckets. Falha ao ler
// nao bloqueia: sem rede ou sem a linha, o app abre como antes.
export function AtualizacaoObrigatoriaGate() {
  const { usuario } = useUsuario();
  const palette = useMemo(() => getProfileShellPalette(perfilVisualDoAluno(usuario)), [usuario]);
  const [bloqueado, setBloqueado] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let ativo = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("app_config")
          .select("chave, valor")
          .in("chave", [CHAVE_VERSAO_MINIMA, CHAVE_URL_ATUALIZACAO]);
        if (error || !ativo) return;
        const config = lerConfigDeVersao(data as { chave: string; valor: string }[] | null);
        const precisa = precisaAtualizar({
          versaoAtual: Constants.expoConfig?.version ?? null,
          versaoMinima: config.versaoMinima,
          plataforma: Platform.OS,
        });
        if (!ativo) return;
        setUrl(urlDeAtualizacaoSegura(config.urlAtualizacao));
        setBloqueado(precisa);
      } catch (e) {
        console.warn("[AtualizacaoObrigatoriaGate] nao foi possivel ler a versao minima:", e);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (!bloqueado) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.tela, { backgroundColor: palette.background }]}>
        <Text style={[styles.titulo, { color: palette.text }]}>Atualize o TrailUp</Text>
        <Text style={[styles.texto, { color: palette.textMuted }]}>
          Esta versão do aplicativo não é mais compatível. Instale a versão mais recente para continuar
          estudando.
        </Text>
        {url ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL(url)}
            style={({ pressed }) => [styles.botao, { backgroundColor: palette.accent }, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.botaoTexto, { color: palette.background }]}>Atualizar agora</Text>
          </Pressable>
        ) : (
          <Text style={[styles.texto, { color: palette.textMuted }]}>Procure o TrailUp na loja de aplicativos do seu celular.</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  titulo: {
    fontSize: 22,
    fontFamily: FontFamily.inikaBold,
    textAlign: "center",
  },
  texto: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.interMedium,
    textAlign: "center",
  },
  botao: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  botaoTexto: {
    fontSize: 16,
    fontFamily: FontFamily.inikaBold,
  },
});
