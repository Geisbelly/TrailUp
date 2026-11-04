# Memória de cálculo dos custos — Resumo Expandido JIC 2026 (v7)

Apêndice do resumo *IA onde importa: uma arquitetura para pesquisar
personalização e acolhimento na educação gamificada* (v7, 04/11/2026).

**Para que serve:** qualquer pessoa consegue refazer cada número de custo e de
horas da v7 a partir das mesmas entradas, ou ver qual entrada ainda falta.

**Como está montado:**

- [`scripts/custos/parametros.json`](../../../scripts/custos/parametros.json)
  guarda as entradas, cada uma com a sua fonte.
- [`scripts/custos/memoria_de_calculo.py`](../../../scripts/custos/memoria_de_calculo.py)
  faz as contas (só biblioteca padrão).
- [`saida.md`](saida.md) é a última execução.

Para reproduzir:

```bash
python3 scripts/custos/memoria_de_calculo.py --saida docs/analises/custos-jic-2026/saida.md
```

Entrada sem valor aparece como **PENDENTE**. O script não preenche lacuna com
estimativa própria.

---

## Situação em 04/11/2026

| Número da v7 | Reproduzível? | O que falta |
|---|---|---|
| 82,5% de redução de gerações por tópico | **Sim** | — (1 − 7/40) |
| R$ 19,50 por perfil / R$ 111 por aluno (turma/mês) | **Coerentes entre si**: os dois dão R$ 1,39 por geração | O custo de uma geração calculado de preço × tokens |
| 44% de economia com dez turmas | **Sim, a partir dos outros números** (44,3%) | Herda as lacunas de R$ 435, R$ 1,32 e R$ 1,39 |
| R$ 435 de parte fixa | Não | Preço de cada plano pago, com data (só o VPS, R$ 80, tem fonte) |
| R$ 1,32 por aluno ao mês | Não | Ciclos e mensagens ao mentor por aluno; preços |
| R$ 314,24 gastos com IA | Não | As faturas, uma a uma |
| 716 h (613–1.009 h) | **Não, e o período não fecha** | Os parâmetros do agrupamento e os repositórios anteriores a 24/06/2026 |
| R$ 80/mês de operação | Parcial | Fatura do VPS registrada como fonte |

## 1. Horas de desenvolvimento

**Método:** agrupar os commits da autora em sessões de trabalho.

- Um intervalo maior que *g* horas entre dois commits abre uma sessão nova.
- Cada sessão vale (último commit − primeiro commit) + *a* horas.
- *a* cobre o trabalho feito antes do primeiro commit da sessão.

```
H(g, a) = Σ_sessões (fim − início) + a × nº de sessões
```

O resultado depende muito de *g* e *a*. Neste repositório, ele vai de 430 h
a 824 h (grade em [`saida.md`](saida.md)). Só a combinação *g* = 4 h,
*a* = 1 h fica perto das 716 h (700 h). **Registre em
`horas.parametro_escolhido` o par usado na v7.** Sem esse par, o número não se
reproduz.

**Inconsistência a resolver no texto:**

- A v7 diz que o desenvolvimento foi "de setembro de 2025 a novembro de 2026",
  com horas "pelo histórico de commits".
- O histórico deste monorepo começa em **24/06/2026**.
- Há duas saídas possíveis:
  - acrescentar em `horas.repositorios` os repositórios com o trabalho
    anterior (por exemplo, BrainHex, ApiBrainHex e o protótipo inicial);
  - ou dizer no texto que as horas cobrem de junho a novembro de 2026.

**Também precisa ser dito:**

- 1.570 dos 2.797 commits têm coautoria de IA (Claude Code ou Cursor). O
  horário mede sessões com agente, não só trabalho humano.
- Squash e rebase alteram horários.
- Leitura, reuniões e escrita fora do git ficam de fora.

**Sugestão para a faixa:**

- declarar a faixa como o mínimo e o máximo da grade publicada;
- ou trocar a faixa 613–1.009 h pela grade efetivamente usada.

## 2. Tokens

O projeto **não grava** o consumo de tokens por chamada. Há duas formas de
estimar.

**(a) Pelo tamanho dos arquivos** (o que a v7 diz ter feito):

```
tokens_entrada = (caracteres do prompt + caracteres do material do professor) / c
tokens_saida   = caracteres da saída / c
```

- *c* é a razão de caracteres por token. Hoje vale 4,0, como suposição.
- O script mede os prompts `.txt` usados por perfil, por tópico e por ciclo do
  aluno.
- Falta medir:
  - o tamanho típico do material do professor por tópico;
  - o tamanho do texto e do roteiro de áudio gerados por perfil;
  - o fator de novas tentativas (2 a 3, segundo a
    [análise de 02/11](../2026-11-02-cli-de-assinatura-no-lugar-da-api-llm.md)).
- A contagem é um **piso**: o microservice monta parte do prompt em
  `geminiService.ts`, fora dos `.txt`.

**(b) Pela amostra real:**

- O microservice imprime o `usageMetadata` devolvido pelo Gemini numa linha
  `[gemini-diag]` ([geminiService.ts](../../../microservice/src/services/geminiService.ts)).
- Exporte os logs do serviço no Dokploy e rode o script com `--logs <arquivo>`.
- Ele resume `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`
  e `totalTokenCount`.
- Com a amostra, *c* deixa de ser suposição: c = caracteres enviados /
  `promptTokenCount`.

Volume de chamadas por tópico novo (7 perfis), conforme a análise de 02/11:

| Item | Chamadas |
|---|---|
| Texto/JSON (enriquecimento, cards, texto e roteiro por perfil, falas do boss) | ~35 |
| TTS (partes de ~4.500 caracteres × 7 perfis) | ~56–112 |
| Imagens | 0–14 |

O TTS é cobrado por caractere ou por áudio, não pelo token de texto, e por
isso entra separado na fórmula.

## 3. Custos

### 3.1 Uma geração (tópico × perfil)

```
custo_geracao_USD = [ tokens_entrada × p_entrada + tokens_saida × p_saida
                    + unidades_TTS × p_TTS + imagens_por_perfil × p_imagem ] × fator_tentativas
custo_geracao_BRL = custo_geracao_USD × PTAX
```

- Os preços vão em `precos`, com a data e a URL da página consultada.
- A v7 cita "preços de tabela de 3 e 4 de novembro de 2026", mas os valores e
  os modelos não estão registrados.
- Hoje, os números da v7 implicam **R$ 1,39 por geração**.

### 3.2 Por turma e mês

```
gerações_por_perfil = tópicos_mês × min(perfis presentes, alunos)   = 2 × 7  = 14
gerações_por_aluno  = tópicos_mês × alunos                           = 2 × 40 = 80
```

A redução de 82,5% é um **teto**: supõe os sete perfis presentes em todas as
turmas. Com menos alunos que perfis, o ganho some (cenário-limite da Tabela 1).

### 3.3 Total mensal e comparação

```
Total(T) = fixo + T × gerações × custo_geracao + T × alunos × custo_por_aluno
```

- **Fixo:** some os planos pagos em `custo_fixo_mensal_brl.itens`.
- **Custo por aluno:** é a segunda camada.
  - O ajuste de cada ciclo usa `personalizacao_comportamental.txt`,
    notificação e intervenção, cerca de 2.200 tokens só de modelo fixo.
  - Somam-se as mensagens ao mentor, com 2 a 4 chamadas cada.
  - Faltam os ciclos e as mensagens por aluno e mês: tirar de
    `telemetria_lotes` e do histórico do mentor no banco.

Com dez turmas: R$ 1.158 contra R$ 2.077, ou seja, **44,3%** de redução. A v7
publica 44%.

### 3.4 Gasto real no desenvolvimento

- Liste cada fatura em `gasto_desenvolvimento.faturas`:
  ```json
  {"data": "2026-10-03", "servico": "...", "moeda": "USD", "valor": 0, "cambio": 0}
  ```
- **Declare no texto** se os R$ 314,24 incluem as assinaturas usadas no
  desenvolvimento (Claude, Cursor) ou só as APIs de produção. Hoje a frase "em
  serviços de IA" permite as duas leituras.

## 4. Proposta de redação para a v7

O espaço do resumo não comporta a memória inteira. A frase de método pode
apontar para este apêndice:

> "O custo foi registrado como efeito secundário: o gasto, pelas faturas; as
> horas, agrupando os commits em sessões (intervalo de *g* h e *a* h por
> sessão, de junho a novembro de 2026); e o custo em planos pagos, por
> estimativa, com preços de tabela de 3 e 4 de novembro de 2026, PTAX de 3 de
> novembro (R$ 5,4935), turmas de 40 alunos e dois tópicos ao mês. Os tokens
> foram estimados pelo tamanho dos prompts e do material, pois o projeto não
> grava esse consumo. A memória de cálculo está em
> github.com/Geisbelly/TrailUp/tree/main/docs/analises/custos-jic-2026."

O link só funciona depois que este apêndice chegar à `main` do espelho.

## 5. Checklist para fechar as pendências

- [ ] `horas.parametro_escolhido`: o par (*g*, *a*) usado nas 716 h.
- [ ] `horas.repositorios`: os repositórios com o trabalho de set/2025 a jun/2026, ou corrigir o período no texto.
- [ ] `precos`: modelo, preço por milhão de tokens (entrada e saída), TTS e imagem, com data e URL.
- [ ] `tokens`: tamanho do material, da saída e do roteiro; fator de novas tentativas.
- [ ] Amostra real: logs do microservice com `[gemini-diag]` → `--logs`.
- [ ] `custo_fixo_mensal_brl.itens`: os planos que compõem os R$ 435.
- [ ] `tokens.ciclos_por_aluno_mes` e `mensagens_mentor_por_aluno_mes`, medidos no banco.
- [ ] `gasto_desenvolvimento.faturas`: as faturas que somam R$ 314,24.
