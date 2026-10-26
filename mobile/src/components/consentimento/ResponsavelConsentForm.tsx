import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { registrarAceiteResponsavel } from "@/services/consentimentoResponsavelApi";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  CONSENTIMENTO_RESPONSAVEL_VERSAO,
  NENHUMA_FINALIDADE,
  RELACOES,
  aceiteResponsavelValido,
  type EstadoConsentimento,
  type Finalidade,
  type Finalidades,
  type Relacao,
} from "@/utils/consentimentoResponsavel";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

// Cor propria, fixa, de proposito: esta tela e para OUTRA pessoa (o
// responsavel) e precisa se destacar do termo do aluno, que segue o perfil.
const DESTAQUE = "#f5a524";

const ITENS: { chave: Finalidade; titulo: string; descricao: string }[] = [
  {
    chave: "camera",
    titulo: "Câmera durante o estudo",
    descricao:
      "Imagens da câmera frontal enquanto o aluno estuda, analisadas no servidor do TrailUp e descartadas na hora. Exige também a análise de emoções.",
  },
  {
    chave: "emocional",
    titulo: "Análise de emoções",
    descricao:
      "Estimativa de atenção, frustração e engajamento a partir do comportamento no app (e da câmera, se autorizada) para adaptar conteúdo e dificuldade. É um palpite, não vira nota.",
  },
  {
    chave: "telemetria",
    titulo: "Telemetria de uso",
    descricao: "Tempo ativo e inativo, toques, rolagem e navegação dentro do app.",
  },
  {
    chave: "mentor",
    titulo: "Mentor de IA",
    descricao:
      "Conversa com o mentor de IA sobre o estudo. As mensagens são enviadas a um provedor de IA contratado para gerar a resposta.",
  },
  {
    chave: "pesquisa",
    titulo: "Uso em pesquisa acadêmica",
    descricao:
      "Dados do aluno em pesquisa sobre aprendizagem do projeto TrailUp, sem identificação nos resultados. O aluno também precisa concordar no Perfil.",
  },
];

export function ResponsavelConsentForm({
  palette,
  estado,
  onConcluido,
  onAdiar,
}: {
  palette: ProfileShellPalette;
  estado: EstadoConsentimento;
  onConcluido: (estado: EstadoConsentimento) => void;
  onAdiar?: () => void;
}) {
  const vigente = estado.responsavel?.vigente === true;
  const [nome, setNome] = useState("");
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [declaracao, setDeclaracao] = useState(false);
  // Tudo DESMARCADO por padrao: consentimento especifico e destacado (art. 14 §1).
  const [finalidades, setFinalidades] = useState<Finalidades>(NENHUMA_FINALIDADE);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const marcar = (chave: Finalidade, valor: boolean) => {
    setFinalidades((prev) => {
      const prox = { ...prev, [chave]: valor };
      // Camera sem analise nao tem uso; analise desligada desliga a camera.
      if (chave === "camera" && valor) prox.emocional = true;
      if (chave === "emocional" && !valor) prox.camera = false;
      return prox;
    });
  };

  const enviar = async (aceito: boolean) => {
    const params = { aceito, nome, relacao, declaracao, finalidades };
    const invalido = aceiteResponsavelValido(params);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await registrarAceiteResponsavel(params);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onConcluido(r.estado);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.faixa, { borderColor: DESTAQUE }]}>
        <Text style={[styles.faixaTexto, { color: DESTAQUE }]}>PARA O RESPONSÁVEL PELO ALUNO</Text>
      </View>
      <Text style={[styles.title, { color: palette.text }]}>Autorização do responsável</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        O aluno tem menos de 18 anos. Pela LGPD (art. 14), alguns dados só podem ser tratados com a
        autorização específica de um dos pais ou do responsável legal. Esta tela é separada do
        termo do aluno: entregue o aparelho ao responsável.
      </Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        Sem a autorização, o aluno usa trilhas, questões e progresso normalmente; só o que está
        abaixo fica desligado. Cada item é uma escolha separada, e tudo pode ser revogado depois em
        Perfil › Coleta e acessos. Se preferir, peça ao professor o termo em papel.
      </Text>

      {vigente ? (
        <View style={[styles.box, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <Text style={[styles.body, { color: palette.text }]}>
            Já existe uma autorização vigente ({estado.responsavel?.metodo === "papel" ? "termo em papel" : "no aparelho"}).
            Preencher de novo substitui a anterior.
          </Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: palette.text }]}>Nome completo do responsável</Text>
      <TextInput
        value={nome}
        onChangeText={setNome}
        placeholder="Nome do responsável"
        placeholderTextColor={palette.textSubtle}
        autoCapitalize="words"
        maxLength={120}
        accessibilityLabel="Nome completo do responsável"
        style={[styles.input, { color: palette.text, borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}
      />

      <Text style={[styles.label, { color: palette.text }]}>Relação com o aluno</Text>
      <View style={styles.chips}>
        {RELACOES.map((r) => {
          const ativo = relacao === r.valor;
          return (
            <Pressable
              key={r.valor}
              onPress={() => setRelacao(r.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              style={[
                styles.chip,
                { borderColor: ativo ? DESTAQUE : palette.border, backgroundColor: ativo ? palette.surfaceElevated : palette.surface },
              ]}
            >
              <Text style={[styles.chipText, { color: ativo ? DESTAQUE : palette.textMuted }]}>{r.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: palette.text }]}>O que você autoriza</Text>
      {ITENS.map((item) => (
        <View key={item.chave} style={[styles.item, { borderColor: palette.border }]}>
          <View style={styles.itemTexto}>
            <Text style={[styles.itemTitulo, { color: palette.text }]}>{item.titulo}</Text>
            <Text style={[styles.itemDescricao, { color: palette.textMuted }]}>{item.descricao}</Text>
          </View>
          <Switch
            value={finalidades[item.chave]}
            onValueChange={(v) => marcar(item.chave, v)}
            accessibilityLabel={item.titulo}
          />
        </View>
      ))}

      <Pressable
        onPress={() => setDeclaracao((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: declaracao }}
        style={styles.declaracao}
      >
        <View style={[styles.checkbox, { borderColor: DESTAQUE, backgroundColor: declaracao ? DESTAQUE : "transparent" }]} />
        <Text style={[styles.body, styles.declaracaoTexto, { color: palette.text }]}>
          Declaro que sou mãe, pai ou responsável legal por este aluno e que li esta autorização
          (versão {CONSENTIMENTO_RESPONSAVEL_VERSAO}).
        </Text>
      </Pressable>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <View style={styles.actions}>
        {onAdiar ? (
          <Pressable
            onPress={onAdiar}
            disabled={salvando}
            accessibilityRole="button"
            style={[styles.button, styles.secondary, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}
          >
            <Text style={[styles.buttonText, { color: palette.text }]}>Agora não</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void enviar(true)}
          disabled={salvando}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: DESTAQUE }, salvando ? styles.disabled : null]}
        >
          <Text style={[styles.buttonText, { color: "#1a1a1a" }]}>{salvando ? "Salvando..." : "Autorizar"}</Text>
        </Pressable>
      </View>
      {vigente ? (
        <Pressable
          onPress={() => void enviar(false)}
          disabled={salvando}
          accessibilityRole="button"
          style={[styles.button, styles.secondary, { borderColor: "#e5484d" }]}
        >
          <Text style={[styles.buttonText, { color: "#e5484d" }]}>Revogar a autorização</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  faixa: { borderWidth: 2, borderRadius: 10, paddingVertical: 6, alignItems: "center" },
  faixaTexto: { fontFamily: FontFamily.inikaBold, fontSize: 13, letterSpacing: 1 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 20 },
  body: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21 },
  box: { borderWidth: 1, borderRadius: 12, padding: 10 },
  label: { fontFamily: FontFamily.inikaBold, fontSize: 14, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FontFamily.interMedium,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, paddingVertical: 8 },
  itemTexto: { flex: 1, gap: 2 },
  itemTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
  itemDescricao: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
  declaracao: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 },
  declaracaoTexto: { flex: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, marginTop: 2 },
  erro: { color: "#e5484d", fontFamily: FontFamily.interMedium, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondary: { borderWidth: 1 },
  buttonText: { fontFamily: FontFamily.inikaBold, fontSize: 14 },
  disabled: { opacity: 0.7 },
});
