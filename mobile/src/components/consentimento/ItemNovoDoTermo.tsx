import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { registrarConsentimentoCuidado } from "@/services/consentimentoResponsavelApi";
import type { ResultadoDoCuidado } from "@/services/consentimentoCuidado";
import { FontFamily } from "@/styles/GlobalStyle";
import { CONSENTIMENTO_CUIDADO_VERSAO } from "@/utils/consentimentoResponsavel";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * "O termo mudou": só o item novo, o modo de cuidado (spec 2026-11-20, seção 1). O aluno aceita
 * ou recusa só este item; o resto do que ele já decidiu não muda.
 *
 * O texto fala do que acontece, não do que o aluno sente: nada de "ansiedade", "ansioso" ou
 * "crise" (DAT-45), e o teste varre tudo. O professor vê o que o app fez, nunca o que o aluno
 * escreveu. A autora revisa este texto antes de ir ao ar; mudou o texto, sobe
 * `CONSENTIMENTO_CUIDADO_VERSAO` junto com `consentimento_cuidado_versao_vigente()`.
 */
export const TITULO_ITEM_CUIDADO = "O termo mudou: um item novo";

export const INTRO_ITEM_CUIDADO =
  "Entrou um item novo no termo: o modo de cuidado. O resto do que você já decidiu continua " +
  "igual. Você aceita ou não só este item.";

export const SECOES_ITEM_CUIDADO: readonly { titulo: string; texto: string }[] = [
  {
    titulo: "O que é",
    texto:
      "Às vezes o uso do app mostra sinais de cansaço: muitos erros seguidos, muito tempo " +
      "estudando sem parar ou uma atividade deixada no meio. Você também pode contar ao Guia " +
      "como está. Nesses momentos, o app alivia o estudo: sugere uma pausa, oferece exercícios " +
      "de respiração e esconde o cronômetro por um tempo.",
  },
  {
    titulo: "O que o professor vê",
    texto:
      "O professor da sua turma vê quando isso aconteceu e o que o app fez, por exemplo \"o app " +
      "sugeriu uma pausa\" ou \"o Guia indicou o CVV 188\". Ele nunca vê o que você escreveu " +
      "ao Guia.",
  },
  {
    titulo: "O que não muda",
    texto:
      "Os sinais de uso não viram emoção nem nota. O modo de cuidado não muda sua nota, seus " +
      "prazos nem seu conteúdo. Enquanto o cronômetro estiver desligado, a atividade não dá o " +
      "bônus por terminar no tempo. O registro fica guardado por até 180 dias.",
  },
  {
    titulo: "Sua escolha",
    texto:
      "Se você aceitar, esses momentos ficam registrados para o professor da sua turma. Se não " +
      "aceitar, nada é registrado: a pausa e os exercícios continuam aparecendo quando você " +
      "precisar, e o Guia continua indicando o CVV 188 quando for o caso. Você pode mudar de " +
      "ideia em Perfil › Coleta e acessos; ao desligar, o que foi registrado é apagado.",
  },
];

/** A linha curta de Perfil › Coleta e acessos e da tela do responsável. */
export const RESUMO_ITEM_CUIDADO =
  "Quando o uso mostra sinais de cansaço ou você conta ao Guia como está, o app alivia o " +
  "estudo e sugere uma pausa. O professor vê quando isso aconteceu e o que o app fez, nunca o " +
  "que você escreveu. Não muda nota nem prazo. Desligar apaga o que foi registrado.";

export const AVISO_MENOR_CUIDADO =
  "Como você tem menos de 18 anos, o modo de cuidado só vale se seu responsável também autorizar.";

export const BOTOES_ITEM_CUIDADO = {
  aceitar: "Aceitar",
  recusar: "Não aceitar",
  depois: "Decidir depois",
} as const;

type Props = {
  palette: ProfileShellPalette;
  /** Decidiu e o banco gravou. */
  onDecidido: (resultado: Extract<ResultadoDoCuidado, { ok: true }>) => void;
  /** Fecha por esta abertura; o item volta na próxima. */
  onAdiar: () => void;
  /** Só para teste. */
  registrar?: (aceito: boolean) => Promise<ResultadoDoCuidado>;
};

export function ItemNovoDoTermo({ palette, onDecidido, onAdiar, registrar = registrarConsentimentoCuidado }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const decidir = async (aceito: boolean) => {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await registrar(aceito);
    setSalvando(false);
    // Falhou: mostra o erro e deixa "Decidir depois" livre. Nunca prende o aluno aqui.
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onDecidido(r);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: palette.text }]}>{TITULO_ITEM_CUIDADO}</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>{INTRO_ITEM_CUIDADO}</Text>
      {SECOES_ITEM_CUIDADO.map((secao) => (
        <View key={secao.titulo} style={styles.secao}>
          <Text style={[styles.sectionTitle, { color: palette.accent }]}>{secao.titulo}</Text>
          <Text style={[styles.body, { color: palette.textMuted }]}>{secao.texto}</Text>
        </View>
      ))}
      <Text style={[styles.versao, { color: palette.textSubtle }]}>Versão {CONSENTIMENTO_CUIDADO_VERSAO}</Text>
      {erro ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: palette.text }]}>
          {erro}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => void decidir(false)}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityState={{ disabled: salvando }}
          style={[styles.button, styles.secondary, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
        >
          <Text style={[styles.buttonText, { color: palette.text }]}>{BOTOES_ITEM_CUIDADO.recusar}</Text>
        </Pressable>
        <Pressable
          onPress={() => void decidir(true)}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityState={{ disabled: salvando }}
          style={[styles.button, { backgroundColor: palette.accent }, salvando ? styles.disabled : null]}
        >
          <Text style={[styles.buttonText, { color: palette.background }]}>
            {salvando ? "Salvando..." : BOTOES_ITEM_CUIDADO.aceitar}
          </Text>
        </Pressable>
      </View>
      <Pressable onPress={onAdiar} accessibilityRole="button" style={styles.depois}>
        <Text style={[styles.depoisText, { color: palette.textMuted }]}>{BOTOES_ITEM_CUIDADO.depois}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 22, marginBottom: 8 },
  secao: { marginTop: 6 },
  sectionTitle: { fontFamily: FontFamily.inikaBold, fontSize: 15, marginBottom: 6 },
  body: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  versao: { fontFamily: FontFamily.interMedium, fontSize: 11, marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 14 },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondary: { borderWidth: 1 },
  buttonText: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
  disabled: { opacity: 0.7 },
  depois: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16, minHeight: 44 },
  depoisText: { fontFamily: FontFamily.interMedium, fontSize: 13 },
});
