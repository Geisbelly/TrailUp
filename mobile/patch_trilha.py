import pathlib, re

path_base = pathlib.Path('tmp_trilha.txt')
text = path_base.read_text(encoding='utf-16', errors='replace')

text = text.replace(
    '  const rawId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";\n\n  const topicoId',
    '  const rawId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";\n  const [atividadeResolvida, setAtividadeResolvida] = useState(false);\n\n  const topicoId'
)

text = text.replace(
    '  const total = blocks.length;\n  const atualBlock =\n    index >= 0 && total > 0 ? blocks[Math.min(index, total - 1)] : null;\n\n  const canBack',
    '  const total = blocks.length;\n  const atualBlock =\n    index >= 0 && total > 0 ? blocks[Math.min(index, total - 1)] : null;\n\n  useEffect(() => {\n    if (!atualBlock) {\n      setAtividadeResolvida(false);\n      return;\n    }\n    if (atualBlock.kind === "atividade") {\n      const st = String(atualBlock.atividade.status ?? "").toLowerCase();\n      const concluida = st.includes("concl");\n      setAtividadeResolvida(concluida);\n    } else {\n      setAtividadeResolvida(true);\n    }\n  }, [atualBlock]);\n\n  const canBack'
)

text = text.replace(
    '  const canBack = index > -1;\n  const canContinue = index < total - 1;',
    '  const canBack = index > -1;\n  const canContinue = index < total - 1;\n  const bloquearContinuar = atualBlock?.kind === "atividade" && !atividadeResolvida;'
)

text = text.replace(
    '  const blocoTagColor =\n    atualBlock?.kind === "atividade" ? "#2ecc71" : Color.colorBlueviolet100;\n\n  useEffect(() => {',
    '  const blocoTagColor =\n    atualBlock?.kind === "atividade" ? "#2ecc71" : Color.colorBlueviolet100;\n\n  const progressoPassos = useMemo(() => {\n    if (total === 0) return 0;\n    let concluidos = 0;\n    blocks.forEach((b, idx) => {\n      if (b.kind === "conteudo") {\n        const st = String(b.conteudo.status ?? "").toLowerCase();\n        const pct = Number(b.conteudo.percentual_concluido ?? 0);\n        if (st.includes("concl") || pct >= 100) {\n          concluidos += 1;\n        } else if (idx < index && !mostrarResumo) {\n          concluidos += 1;\n        }\n      } else {\n        const st = String(b.atividade.status ?? "").toLowerCase();\n        const concluida = st.includes("concl") || (idx === index && atividadeResolvida);\n        if (concluida) concluidos += 1;\n      }\n    });\n    return (concluidos / total) * 100;\n  }, [blocks, total, index, mostrarResumo, atividadeResolvida]);\n\n  useEffect(() => {'
)

text = text.replace(
    '      const acertou = resultado?.correto ?? false;\n      const percentual = resultado?.acertosPercentual ?? 0;\n\n      try {\n        await registrarAtividadeConcluida(topicoId, atividadeId, percentual);\n\n        await registrarEvento(',
    '      const acertou = resultado?.correto ?? false;\n      const percentual = resultado?.acertosPercentual ?? (acertou ? 100 : 10);\n\n      try {\n        await registrarAtividadeConcluida(topicoId, atividadeId, percentual);\n        setAtividadeResolvida(true);\n\n        await registrarEvento('
)

text = text.replace(
    '{Math.round(percentualGeral)}%',
    '{Math.round(topico?.status === "concluido" ? 100 : progressoPassos)}%'
)
text = text.replace(
    '{ width: ${percentualGeral}% },',
    '{ width: ${topico?.status === "concluido" ? 100 : progressoPassos}% },'
)

text = text.replace(
    '          text: "Ir para as questões",\n          onPress: async () => {\n            setMostrarResumo(false);\n            setIndex(primeiraAtividadeIndex);\n            if (topicoId) {\n              await registrarEvento(\n                "topico_pular_conteudo",\n                	opico:\n              );\n            }\n          },\n        },\n      ]\n    );\n  }, [blocks, registrarEvento, topicoId]);',
    '          text: "Ir para as questões",\n          onPress: async () => {\n            setMostrarResumo(false);\n            setIndex(primeiraAtividadeIndex);\n            if (topicoId) {\n              await registrarEvento(\n                "topico_pular_conteudo",\n                	opico:\n              );\n              await marcarTopicoIniciado(topicoId);\n              await refreshTopico(topicoId);\n            }\n          },\n        },\n      ]\n    );\n  }, [blocks, registrarEvento, topicoId, marcarTopicoIniciado, refreshTopico]);'
)

pattern = r"const handleConcluirTopico = useCallback\(async \(\) => \{.*?const handleVoltar"
m = re.search(pattern, text, re.S)
if not m:
    raise SystemExit('handleConcluirTopico not found')
new_block = """const handleConcluirTopico = useCallback(async () => {
    if (!topicoId) return;

    try {
      if (topico && topico.conteudos?.length) {
        await Promise.all(
          topico.conteudos.map((c: any) => marcarConteudoVisto(topicoId, Number(c.id)))
        );
      }

      await marcarTopicoConcluido(topicoId);

      await registrarEvento(\"topico_concluido\", 	opico:, 100);
      await Promise.all([reloadRanking(), reloadConquistas()]);

      const proximos = getProximosTopicos(topicoId);
      await reloadTrilha();

      if (!proximos.length) {
        Alert.alert(
          \"Parabens!\",
          \"Voce concluiu este modulo!\",
          [{ text: \"OK\", onPress: () => router.back() }]
        );
        return;
      }

      if (proximos.length === 1) {
        const destino = proximos[0];
        Alert.alert(
          \"Modulo concluido!\",
          Proximo disponivel: \"\". Deseja ir agora?,
          [
            { text: \"Depois\", style: \"cancel\", onPress: () => router.back() },
            { text: \"Ir para o proximo\", onPress: () => router.replace(/trilha/) },
          ]
        );
        return;
      }

      Alert.alert(
        \"Escolha o proximo modulo\",
        \"Mais de um no esta desbloqueado. Para onde deseja ir?\",
        [
          { text: \"Cancelar\", style: \"cancel\" },
          ...proximos.map((p) => ({
            text: p.nome ?? Modulo ,
            onPress: () => router.replace(/trilha/),
          })),
        ]
      );
    } catch (err) {
      console.error(\"[TrilhaConteudo] Erro ao concluir topico:\", err);
      router.back();
    }
  }, [
    topicoId,
    topico,
    marcarTopicoConcluido,
    marcarConteudoVisto,
    registrarEvento,
    reloadRanking,
    reloadConquistas,
    getProximosTopicos,
    reloadTrilha,
    router,
  ]);

  const handleVoltar"""
text = text[:m.start()] + new_block + text[m.end():]

text = text.replace(
    '  const handleVoltar = useCallback(() => {\n    if (index === 0) {\n      setIndex(-1);\n      setMostrarResumo(true);\n    } else {\n      setIndex((p) => Math.max(-1, p - 1));\n    }\n  }, [index]);',
    '  const handleVoltar = useCallback(() => {\n    if (index === 0) {\n      setIndex(-1);\n      setMostrarResumo(true);\n    } else {\n      setIndex((p) => Math.max(-1, p - 1));\n    }\n    setAtividadeResolvida(false);\n  }, [index]);'
)

text = text.replace(
    '              <Pressable\n                style={styles.button}\n                onPress={async () => {\n                  if (canContinue) {\n                    setIndex((p) => p + 1);\n                  } else {\n                    await handleConcluirTopico();\n                  }\n                }}\n              >\n                <Text style={styles.buttonText}>\n                  {canContinue ? "Continuar" : "Concluir módulo"}\n                </Text>\n              </Pressable>',
    '              <Pressable\n                style={[styles.button, bloquearContinuar && styles.buttonDisabled]}\n                onPress={async () => {\n                  if (bloquearContinuar) return;\n                  if (canContinue) {\n                    setIndex((p) => p + 1);\n                    setAtividadeResolvida(false);\n                  } else {\n                    await handleConcluirTopico();\n                  }\n                }}\n                disabled={bloquearContinuar}\n              >\n                <Text style={styles.buttonText}>\n                  {canContinue ? "Continuar" : "Concluir módulo"}\n                </Text>\n              </Pressable>'
)

pathlib.Path('src/app/(tabs)/trilha/[id].tsx').write_text(text, encoding='utf-16')

