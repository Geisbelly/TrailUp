import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  FRASE_DO_SELO,
  ROTULO_DO_SELO,
  explicacaoDe,
  rotuloAcessivel,
  type ChaveMetrica,
} from "@/services/metricas/explicacoes";
import { coresDaExplicacao, type CoresDaExplicacao } from "./coresDaExplicacao";

export type { CoresDaExplicacao } from "./coresDaExplicacao";

// O ícone de informação é só desta explicação: o ponto de interrogação já é o guia da seção.
const ICONE = "information-outline" as const;
// Área de toque de 44 pt em volta de um ícone de 16.
const FOLGA = 14;

function Bloco({ titulo, texto, cores }: { titulo: string; texto: string; cores: CoresDaExplicacao }) {
  return (
    <View style={s.bloco}>
      <Text style={[s.blocoTitulo, { color: cores.suave }]}>{titulo}</Text>
      <Text style={[s.blocoTexto, { color: cores.texto }]}>{texto}</Text>
    </View>
  );
}

/** Ícone ao lado de uma métrica que abre como ela é coletada, quando atualiza e quanto confiar. */
export function ExplicacaoDaMetrica({ chave, cores: brutas }: { chave: ChaveMetrica; cores: CoresDaExplicacao }) {
  const [aberta, setAberta] = useState(false);
  const cores = useMemo(() => coresDaExplicacao(brutas), [brutas]);
  const e = explicacaoDe(chave);

  return (
    <>
      <Pressable
        onPress={() => setAberta(true)}
        hitSlop={FOLGA}
        accessibilityRole="button"
        accessibilityLabel={rotuloAcessivel(chave)}
        style={s.icone}
      >
        <MaterialCommunityIcons name={ICONE} size={16} color={cores.destaque} />
      </Pressable>
      <Modal transparent animationType="fade" visible={aberta} onRequestClose={() => setAberta(false)}>
        <Pressable style={s.fundo} onPress={() => setAberta(false)} accessibilityLabel="Fechar explicação">
          {/* O toque dentro do cartão não fecha: só o fundo e o botão. */}
          <Pressable style={[s.cartao, { backgroundColor: cores.fundo, borderColor: cores.borda }]} onPress={() => undefined} accessible={false}>
            <ScrollView contentContainerStyle={s.conteudo}>
              <View style={s.topo}>
                <MaterialCommunityIcons name={ICONE} size={20} color={cores.destaque} />
                <Text style={[s.nome, { color: cores.texto }]} accessibilityRole="header">{e.nome}</Text>
              </View>
              <View style={[s.selo, { borderColor: cores.borda }]}>
                <Text style={[s.seloTexto, { color: cores.texto }]}>{ROTULO_DO_SELO[e.selo]}</Text>
              </View>
              <Text style={[s.fraseSelo, { color: cores.suave }]}>{FRASE_DO_SELO[e.selo]}</Text>
              <Bloco titulo="O que mede" texto={e.oQueMede} cores={cores} />
              <Bloco titulo="Como é coletado" texto={e.comoColeta} cores={cores} />
              <Bloco titulo="Quando atualiza" texto={e.atualiza} cores={cores} />
              {e.limites?.length ? (
                <View style={s.bloco}>
                  <Text style={[s.blocoTitulo, { color: cores.suave }]}>Limites</Text>
                  {e.limites.map((limite) => (
                    <Text key={limite} style={[s.blocoTexto, { color: cores.texto }]}>• {limite}</Text>
                  ))}
                </View>
              ) : null}
              <Bloco titulo="O que não significa" texto={e.naoSignifica} cores={cores} />
              <Pressable
                onPress={() => setAberta(false)}
                accessibilityRole="button"
                style={[s.botao, { borderColor: cores.destaque }]}
              >
                <Text style={[s.botaoTexto, { color: cores.texto }]}>Entendi</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  icone: { alignItems: "center", justifyContent: "center", width: 16, height: 16 },
  fundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  cartao: { width: "100%", maxWidth: 420, maxHeight: "80%", borderRadius: 16, borderWidth: 1 },
  conteudo: { padding: 20, gap: 12 },
  topo: { flexDirection: "row", alignItems: "center", gap: 8 },
  nome: { flex: 1, fontSize: 18, fontWeight: "700" },
  selo: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  seloTexto: { fontSize: 13, fontWeight: "700" },
  fraseSelo: { fontSize: 14, lineHeight: 20 },
  bloco: { gap: 3 },
  blocoTitulo: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  blocoTexto: { fontSize: 15, lineHeight: 22 },
  botao: { marginTop: 4, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontSize: 15, fontWeight: "700" },
});
