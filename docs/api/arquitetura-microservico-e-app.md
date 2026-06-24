# Arquitetura do Microservico e do App (Contexto API TrailUp)

## Objetivo
Documentar como a API TrailUp, o microservico de midia (ApiBrainHex) e os apps (mobile e web) se conectam para entregar personalizacao de estudo.

## Escopo
- API principal (este repositorio)
- microservico de midia (ApiBrainHex)
- app mobile (aluno)
- app web (professor)
- Supabase (auth, banco, storage)

## Visao arquitetural

```text
Web Professor -----> API TrailUp -----> ApiBrainHex
      |                    |                 |
      |                    v                 v
      +---------------> Supabase <-----------+
                               ^
                               |
                        App Mobile (Aluno, leitura direta)
```

## Responsabilidades por bloco

### API TrailUp
- orquestrar personalizacao por aluno/topico
- controlar fila de jobs e targets
- deduplicar jobs de midia por perfil BrainHex e source_hash
- publicar contratos para mobile/web
- receber telemetria

### ApiBrainHex
- gerar markdown, audio e apresentacao por perfil
- aplicar identidade do perfil BrainHex em voz/estilo
- subir artefatos no Storage
- atualizar `conteudo_personalizado.materiais`

### Web Professor
- modelar estrutura pedagogica
- disparar jobs de personalizacao
- acompanhar status operacional

### App Mobile
- consumir trilha e personalizacao direto no Supabase (por perfil BrainHex)
- renderizar formatos de conteudo e midia
- persistir progresso e tempo de estudo ativo
- emitir eventos e telemetria (API + tabelas de progresso)

### Supabase
- persistencia transacional
- autenticacao e autorizacao
- armazenamento de arquivos
- views de consolidacao (ex.: rank)

## Decisoes de arquitetura atuais
- job de midia deduplicado por `brainhex_profile_key` (nao por aluno)
- reuso de artefato por perfil no mesmo contexto pedagogico
- atualizacao por artefato com status (`pending`, `completed`, `failed`)
- consumo de ranking por view consolidada, nao por tabela derivada

## Motivos e objetivos
- reduzir custo e tempo de geracao de midia
- aumentar consistencia visual/pedagogica por perfil BrainHex
- evitar recalculo desnecessario entre alunos com mesmo perfil
- manter contrato estavel para apps mesmo com evolucao interna

## Objetivos operacionais
- menor latencia media de entrega de materiais
- menor taxa de falha em processamento multimidia
- menor duplicidade de arquivos equivalentes
- rastreabilidade por job, target e artefato

## Riscos e mitigacoes
- risco: falha parcial de geracao de midia
  - mitigacao: status por artefato e fallback no cliente
- risco: divergencia entre dado bruto e consolidado de rank
  - mitigacao: padronizar leitura por view SQL oficial
- risco: regressao de contrato
  - mitigacao: manter campos legados e normalizacao no app
