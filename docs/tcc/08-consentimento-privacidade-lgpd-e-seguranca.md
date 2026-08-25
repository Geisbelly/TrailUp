# 08. Consentimento, privacidade, LGPD e seguranca

Data de atualizacao: 2026-04-19

## 1. Premissas de conformidade
- minimizacao de dados pessoais;
- finalidade explicita para coleta e uso;
- segregacao de acesso por perfil de usuario;
- rastreabilidade de operacoes sensiveis.

## 2. Dados tratados no ecossistema
- identificadores de conta e turma;
- progresso pedagogico e eventos de uso;
- artefatos de personalizacao;
- metadados tecnicos de operacao.

## 3. Bases legais (LGPD)
Aplicacao tipica:
- execucao de contrato educacional/plataforma;
- cumprimento de obrigacoes legais e regulatorias;
- legitimo interesse com teste de balanceamento;
- consentimento quando exigido por finalidade especifica.

## 4. Consentimento e transparencia
Boas praticas:
- linguagem clara de finalidade;
- opcao de revogacao quando cabivel;
- politica de privacidade acessivel;
- registro de versao dos termos aceitos.

## 5. Controle de acesso
- autenticacao baseada em token/JWT;
- autorizacao por papel (aluno/professor/admin);
- segregacao por classe e escopo de dados;
- principle of least privilege para chaves de servico.

## 6. Seguranca de aplicacao
- validacao de input e schema;
- sanitizacao de payloads e links;
- protecao contra abuso de endpoints;
- tratamento de erro sem exposicao de segredo.

## 7. Seguranca de infraestrutura
- armazenamento seguro de secrets em ambiente;
- conexoes TLS em transito;
- backup e recuperacao de banco;
- monitoramento de disponibilidade e anomalias.

## 8. Retencao e descarte
- politica de retencao por categoria de dado;
- exclusao/anonimizacao quando aplicavel;
- trilha de auditoria para operacoes criticas.

## 9. Resposta a incidente
Fluxo recomendado:
1. detectar e classificar severidade;
2. conter impacto;
3. erradicar causa raiz;
4. recuperar servico;
5. comunicar partes interessadas e registrar plano preventivo.

## 10. Matriz de responsabilidades
- produto: define finalidade e transparencia;
- engenharia: implementa controles tecnicos;
- operacao: monitora e responde a incidentes;
- governanca: revisa conformidade periodica.
