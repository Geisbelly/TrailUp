/**
 * Esqueleto da caixa de entrada. A lista nascia com "Sem notificações" enquanto a
 * primeira página ainda vinha do banco, o que dizia ao aluno que não havia nada.
 *
 * As medidas copiam as da linha de `CardNotificacao` (s.row): ícone de 40 px com raio 12,
 * título com hora e uma linha de texto, para nada pular quando a lista chega.
 */
import { EsqueletoBloco, EsqueletoGrupo, EsqueletoRepetir } from "@/components/carregamento/Esqueleto";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import React from "react";
import { StyleSheet, View } from "react-native";

export function EsqueletoDaCaixa({ palette }: { palette: ProfileShellPalette }) {
  return (
    <EsqueletoGrupo rotulo="Carregando notificações" superficie={palette.background}>
      <EsqueletoRepetir quantos={6} espaco={0}>
        {(i) => (
          <View>
            {i > 0 ? <View style={[styles.separador, { backgroundColor: palette.border }]} /> : null}
            <View style={styles.linha}>
              <EsqueletoBloco largura={40} altura={40} raio={12} />
              <View style={styles.texto}>
                <View style={styles.titulo}>
                  <EsqueletoBloco largura={i % 2 === 0 ? "58%" : "70%"} altura={14} />
                  <EsqueletoBloco largura={34} altura={10} />
                </View>
                <EsqueletoBloco largura={i % 3 === 2 ? "64%" : "88%"} altura={12} />
              </View>
            </View>
          </View>
        )}
      </EsqueletoRepetir>
    </EsqueletoGrupo>
  );
}

const styles = StyleSheet.create({
  separador: { height: 1 },
  linha: { flexDirection: "row", alignItems: "flex-start", minHeight: 72, paddingVertical: 12, paddingLeft: 16, paddingRight: 14, gap: 12 },
  texto: { flex: 1, gap: 9, paddingTop: 2 },
  titulo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
});
