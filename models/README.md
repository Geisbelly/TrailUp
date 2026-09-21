# models — artefatos treinados

Pesos treinados nos datasets de pesquisa do `core-trailup`, versionados aqui para
dar à integração um caminho estável e rastreável. O **código** dos módulos
(`trailup_core/`), os scripts de treino e os relatórios permanecem no
repositório de pesquisa — este diretório guarda **só os artefatos**.

```
models/
  README.md
  m2_knowledge_tracing/
    v3/
      m2_gate_v3.pkl
      m2_model_v3.pkl
```

## M2 — knowledge tracing (EdNet KT3)

Dois modelos distintos, não um. Usar um no papel do outro degrada o gate
(`RELATORIO_M2.md` §8).

| arquivo | pergunta | alvo | AUC | log-loss | ECE | features |
|---|---|---|---|---|---|---|
| `m2_model_v3.pkl` | o aluno acerta esta questão? | resposta final (`y`) | 0,753 | 0,540 | 0,002 | 25 |
| `m2_gate_v3.pkl` | o aluno vai travar neste tópico? | acerto das próximas 10 respostas < 50% | 0,779 | — | 0,004 | 30 |

Ambos são `HistGradientBoostingClassifier` (scikit-learn), sem dependência
nativa. Referências da regra que eles substituem no TrailUp: AUC 0,587 e ECE
0,201 para o domínio; AUC 0,703 para o gate.

## Contrato do pickle

Cada arquivo é um `dict` com quatro chaves:

| chave | conteúdo |
|---|---|
| `model` | o `HistGradientBoostingClassifier` treinado |
| `feats` | ordem exata das colunas usadas no `predict_proba` |
| `diff` | dificuldade por `qidx` estimada **só no treino**, encolhida para a média (prior 20) |
| `global` | taxa de acerto global do treino, fallback de `diff` |

```python
import pickle

with open("models/m2_knowledge_tracing/v3/m2_model_v3.pkl", "rb") as fh:
    pacote = pickle.load(fh)

modelo, features = pacote["model"], pacote["feats"]
# `features` é a ordem das colunas; monte a linha nessa ordem.
p_acerta = modelo.predict_proba(linha[features])[:, 1]
```

Desserializar exige `scikit-learn` instalado no ambiente que carrega o arquivo.

## Proveniência

- Repositório: `Geisbelly/core-trailup`, commit `ae65f4e`
- Origem: `docs/m2_knowledge_tracing/scripts/`
- Dataset: EdNet KT3 — 6.504.124 respostas finais, 27.792 alunos, taxa de acerto
  global 0,668. Licença **CC BY-NC 4.0**.
- Relatório: `docs/m2_knowledge_tracing/RELATORIO_M2.md`
- Regeneração: `python3 15_treina_v3.py {proxima|gate} v3` (o segundo comando
  gera `m2_model_v3.pkl`, o primeiro, `m2_gate_v3.pkl`)

Os valores de `diff` e `global` são do EdNet. Em dado próprio, a ordem do modelo
transfere mas o nível não: recalibre antes de usar.

## Integridade

| arquivo | bytes | sha256 |
|---|---|---|
| `m2_model_v3.pkl` | 2.930.307 | `efc647e703b60a4b2dbc28d464769bde6efa576ce9e5a3043e6786ba3037d9b8` |
| `m2_gate_v3.pkl` | 2.933.449 | `03a681921b165e517a7697030610e283c6eef99756cb29832868602e68e04a8b` |

O `m2.zip` que existe no repositório de pesquisa não foi duplicado aqui: é um
arquivo com cópias byte-idênticas destes dois `.pkl`.

## Licença — leia antes de usar

Os pesos foram treinados no **EdNet KT3, CC BY-NC 4.0 (não comercial)**. Uso
acadêmico está coberto; produto comercial não. Versionar aqui não autoriza uso
comercial. A decisão precisa ser tomada antes do deploy, não depois — ver
`RELATORIO_M2.md` §10.7.
