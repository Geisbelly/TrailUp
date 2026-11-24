# Memória de cálculo — saída do script

Gerado em 2026-11-09 03:45 UTC por `scripts/custos/memoria_de_calculo.py`. `PENDENTE` = entrada ainda não registrada em `parametros.json`.

## 1. Horas de desenvolvimento (histórico de commits)

Commits até 2026-11-08 (corte em `horas.periodo_declarado.fim`, para o número não mudar a cada commit novo).

| Repositório | Commits da autora | Primeiro | Último | Com coautoria de IA |
|---|---|---|---|---|
| `BitStudioLabs/trail-up` | 1839 | 2026-08-25 | 2026-11-08 | 1283 |
| `Geisbelly/TrailUp` | 2070 | 2026-06-24 | 2026-11-08 | 1124 |
| `BitStudioLabs/trailup-app-dsm-2502` | 157 | 2025-09-21 | 2026-06-23 | 22 |
| `Geisbelly/brainhex-navigator` | 38 | 2025-12-02 | 2026-06-24 | 3 |
| `Geisbelly/ApiTraiUp` | 29 | 2026-04-06 | 2026-06-23 | 11 |
| `Geisbelly/ApiBrainHex` | 32 | 2026-04-17 | 2026-05-16 | 20 |
| `Geisbelly/BrainHexPDF` | 97 | 2026-08-14 | 2026-08-29 | 45 |
| `Geisbelly/core-trailup` | 23 | 2026-08-28 | 2026-09-30 | 9 |

Sem repetição entre repositórios (o mesmo commit no Lab e no espelho conta uma vez): **3.555 commits**, 1.954 com coautoria de IA (55%), 3.331 horários únicos, **132 dias com commit** (horário de Brasília), de 2025-09-21 a 2026-11-08.

Sensibilidade aos dois parâmetros do agrupamento (horas):

| Intervalo que abre sessão | +0,5 h/sessão | +1,0 h/sessão | +2,0 h/sessão |
|---|---|---|---|
| 1 h | 558 | 741 | 1.108 |
| 2 h | 658 | 785 | 1.039 |
| 3 h | 745 | 849 | 1.058 |
| 4 h | 830 | 920 | 1.099 |

Faixa da grade: 558 a 1.108 h.
Parâmetro declarado: intervalo 2 h, +1 h por sessão → **785 h** em 254 sessões.
- Monografia (08/11/2026): cerca de 785 h (558 a 1.108 h), 132 dias, 3.555 commits, 55% com coautoria de IA
- Resumo JIC v7 (04/11/2026): 716 h (613 a 1.009 h), 137 dias — parâmetro e repositórios não registrados; não se reproduz

Limites do método: horário de commit não é hora trabalhada; commits com coautoria de IA registram sessões com agente, não só trabalho humano; squash e rebase mudam horários; leitura, reuniões e escrita fora do git não aparecem; repositório privado só entra para quem tem acesso a ele.

## 2. Tokens (estimados pelo tamanho dos arquivos)

Conversão: **4.0 caracteres por token** — Suposição a calibrar com a linha [gemini-diag] dos logs do microservice (opção --logs).

| Prompt (modelo fixo, sem o contexto) | Caracteres | Tokens estimados |
|---|---|---|
| `gerador_conteudo.txt` (por perfil) | 10.142 | 2.536 |
| `pipeline_midia_etapas.txt` (por perfil) | 11.220 | 2.805 |
| `enriquecedor_blocos_conteudo.txt` (por tópico) | 1.401 | 350 |
| `materiais_personalizados.txt` (por tópico) | 2.437 | 609 |
| `boss_falas.txt` (por tópico) | 3.247 | 812 |
| `personalizacao_comportamental.txt` (por aluno e ciclo) | 5.267 | 1.317 |
| `notificacao_personalizada.txt` (por aluno e ciclo) | 1.940 | 485 |
| `intervencao.txt` (por aluno e ciclo) | 1.682 | 420 |
| `mentor_personalizacao_chat.txt` (mentor (por chamada)) | 2.783 | 696 |

Por geração (tópico × perfil):

- entrada ≈ (prompts por perfil 21.362 + material PENDENTE) / 4.0 = **PENDENTE tokens**
- saída de texto ≈ PENDENTE / 4.0 = **PENDENTE tokens**
- roteiro de áudio (TTS) = **PENDENTE caracteres** (o TTS cobra por caractere ou por áudio, não pelo token de texto)
- fator de novas tentativas = **PENDENTE**

O microservice monta parte dos prompts no próprio código (`geminiService.ts`), fora dos `.txt`: a contagem acima é um piso. A amostra real abaixo corrige isso.

Amostra real: **PENDENTE** — rode com `--logs <arquivo>` sobre os logs do microservice no Dokploy (linhas `[gemini-diag]`).

## 3. Custos

Câmbio: R$ 5,4935 por US$ (PTAX venda do Banco Central, 03/11/2026 (valor citado na v7)).

### 3.1 Gerações de mídia por turma e mês

- por perfil: 2 tópicos × min(7 perfis, 40 alunos) = **14**
- por aluno: 2 tópicos × 40 alunos = **80**
- redução por tópico: 1 − 7/40 = **82,5%** (v7: 82,5%) — é teto: supõe os 7 perfis presentes

### 3.2 Custo de uma geração (tópico × perfil)

Calculado dos preços e tokens: **PENDENTE** (faltam preços com data e/ou tokens em `parametros.json`).

Implícito nos números da v7: R$ 19,50 / 14 = **R$ 1,39** e R$ 111,00 / 80 = **R$ 1,39** (diferença de 0,4%: os dois valores usam o mesmo custo unitário, arredondado).

### 3.3 Parte fixa mensal (planos pagos)

| Serviço | Valor | Fonte |
|---|---|---|
| VPS (Hetzner, Dokploy) | R$ 80,00 | Fatura do servidor; valor citado na v7 como custo atual |
| Supabase (plano pago) | PENDENTE | PENDENTE |
| Vercel (plano pago) | PENDENTE | PENDENTE |
| Cloudflare R2 | PENDENTE | PENDENTE |
| Expo / EAS | PENDENTE | PENDENTE |
| Outros | PENDENTE | PENDENTE |

Soma com fonte: **R$ 80,00** (incompleta); v7: R$ 435,00.

### 3.4 Segunda camada, por aluno e mês

Usado: **R$ 1,32** (valor da v7, sem memória). Para calcular: ciclos de telemetria por aluno e mês (PENDENTE) × tokens dos prompts por ciclo (2.222 só de modelo fixo) + mensagens ao mentor (PENDENTE) × 3 chamadas, a preço de tabela.

### 3.5 Comparação com 10 turmas

Total = fixo + turmas × gerações × custo da geração + turmas × alunos × custo por aluno (geração: implícito na v7, não medido; fixo: valor da v7, sem decomposição; por aluno: valor da v7, sem memória).

| Estratégia | Fixo | Geração | Por aluno | Total/mês |
|---|---|---|---|---|
| por perfil | R$ 435,00 | R$ 195,00 | R$ 528,00 | **R$ 1.158,00** |
| por aluno | R$ 435,00 | R$ 1.114,29 | R$ 528,00 | **R$ 2.077,29** |

Redução: **44,3%** (v7: 44%).

### 3.6 Gasto real com IA no desenvolvimento

**PENDENTE**: nenhuma fatura em `gasto_desenvolvimento.faturas`. v7: R$ 314,24.
