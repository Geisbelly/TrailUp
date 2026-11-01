import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { definirCronometro, lerCronometro } from "@/services/tentativasAtividade";
import { FontFamily } from "@/styles/GlobalStyle";
import { getBrainHexProfileCapabilities } from "@/utils/brainHexCapabilities";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * O cronômetro das atividades (#136): ligado pelo perfil, e o aluno pode desligar.
 * Salva na hora (`aluno_definir_cronometro`), fora do "Editar" do perfil: é uma
 * escolha, não um dado cadastral. Sem escolha gravada, mostra o padrão do perfil.
 * Tempo não mexe na nota, só no XP: desligar não tira nada da nota.
 */
export function InterruptorCronometro({
  alunoId,
  perfil,
  palette,
}: {
  alunoId: string | null | undefined;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
}) {
  const padraoDoPerfil = getBrainHexProfileCapabilities(perfil).hasTimer;
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alunoId) return;
    let ativo = true;
    lerCronometro(alunoId).then((valor) => {
      if (ativo) setEscolha(valor);
    });
    return () => {
      ativo = false;
    };
  }, [alunoId]);

  const ligado = escolha ?? padraoDoPerfil;

  const trocar = async (valor: boolean) => {
    const anterior = escolha;
    setEscolha(valor);
    setErro(null);
    setSalvando(true);
    try {
      const gravado = await definirCronometro(valor);
      if (gravado == null) throw new Error("indisponível");
      setEscolha(gravado);
    } catch {
      setEscolha(anterior);
      setErro("Não deu para salvar agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.linha}>
        <View style={styles.textos}>
          <Text style={[styles.rotulo, { color: palette.text }]}>Cronômetro nas atividades</Text>
          <Text style={[styles.ajuda, { color: palette.textMuted }]}>
            {ligado
              ? "Terminar no tempo vale XP extra. O tempo não muda a sua nota."
              : "Sem contagem regressiva. A nota é a mesma; só o XP extra por tempo não vale."}
          </Text>
        </View>
        <Switch
          value={ligado}
          disabled={!alunoId || salvando}
          onValueChange={trocar}
          trackColor={{ false: palette.border, true: palette.accent }}
          accessibilityLabel="Cronômetro nas atividades"
        />
      </View>
      {erro ? <Text style={[styles.ajuda, { color: palette.textMuted }]}>{erro}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  linha: { flexDirection: "row", alignItems: "center", gap: 12 },
  textos: { flex: 1, gap: 2 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 15 },
  ajuda: { fontSize: 13, lineHeight: 18 },
});
