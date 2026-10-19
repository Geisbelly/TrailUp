---
fonte: Google Drive — TCC 1 / Relatório Técnico TrailUp.docx
link: https://drive.google.com/file/d/1H0WpdKPOZka1Ddr4JZHVTGAzBU_iZ8rf/view
exportado: 2026-10-18
---

> Cópia em texto do documento do Drive (conversão automática docx → Markdown). Imagens, prints e diagramas foram omitidos; o original no Drive é a fonte de verdade.

_[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]_

UNIVERSIDADE LUTERANA DO BRASIL - ULBRA

CURSO DE CIÊNCIA DA COMPUTAÇÃO

TRAILUP

> Relatório Técnico de Submissão do Aplicativo à Google Play Store
>
> Alunas:
>
> Geisbelly Victória Feitosa Moraes Domiciano Maria Antônia Alves Curcino
>
> Professor:
>
> Jackson Gomes de Souza
>
> PALMAS - TO 2025

GEISBELLY VICTÓRIA FEITOSA MORAES DOMICIANO

> MARIA ANTÔNIA ALVES CURCINO
>
> TRAILUP: SUBMISSÃO DO APLICATIVO À GOOGLE PLAY STORE
>
> Relatório técnico apresentado como requisito parcial de avaliação da disciplina de Desenvolvimento de Software para Dispositivos Móveis do curso de Ciência da Computação da Universidade Luterana do Brasil - ULBRA Palmas.
>
> Professor: Jackson Gomes de Souza
>
> PALMAS - TO 2025
>
> Conteúdo

1.  [Introdução](#introdução) 3

2.  [Identificação do Projeto](#identificação-do-projeto) 3

    1.  [Funcionalidades](#funcionalidades) 3

3.  [Tecnologias Utilizadas](#tecnologias-utilizadas) 3

4.  [Preparação do Ambiente](#preparação-do-ambiente) 4

5.  [Geração do Build do Aplicativo](#geração-do-build-do-aplicativo) 5

    1.  [Procedimentos](#procedimentos) 5

6.  [Submissão na Google Play Store](#submissão-na-google-play-store) 7

    1.  [Criação da Conta no Google Play Console](#criação-da-conta-no-google-play-console) 7

    2.  [Criação do Aplicativo](#criação-do-aplicativo) 7

    3.  [Configuração da Ficha da Loja](#configuração-da-ficha-da-loja) 8

    4.  [Classificação e Segurança](#classificação-e-segurança) 10

    5.  [Envio da Versão para Acesso Antecipado](#envio-da-versão-para-acesso-antecipado) 15

    6.  [Restrições e Acessos do app](#restrições-e-acessos-do-app) 16

    7.  [Política de Privacidade](#política-de-privacidade) 16

    8.  [Versão de Testes Internos (Google Play Console)](#versão-de-testes-internos-google-play-console) 16

7.  [Resultados e Conclusão](#resultados-e-conclusão) 19

8.  [Referências](#referências) 19

# INTRODUÇÃO

> Este relatório tem como objetivo documentar detalhadamente todo o processo de submissão do aplicativo TrailUp para a Google Play Store, conforme solicitado na atividade da disciplina.

# IDENTIFICAÇÃO DO PROJETO

- Nome do aplicativo: TrailUp

- Versão: 1.0.0 (Beta)

- Plataforma: Android

- Público-alvo: Alunos da ULBRA Palmas

- Objetivo: Apoiar o aprendizado por meio de trilhas gamificadas

## Funcionalidades

- Trilhas de aprendizado personalizadas;

- Gamificação com sistema de XP;

- Sincronização em nuvem via Supabase.

# TECNOLOGIAS UTILIZADAS

> Para o desenvolvimento e publicação, foram utilizadas as seguintes tecnologias:

- Expo;

- React Native;

- EAS Build (Expo Application Services);

- Supabase (PostgreSQL);

- Google Play Console.

# PREPARAÇÃO DO AMBIENTE

> Foram configuradas as ferramentas necessárias para geração do build e publicação:

- Node.js;

- Expo CLI;

- EAS CLI;

- Editor VS Code;

- Dispositivo físico Android para testes.

_[imagem omitida — ver original no Drive]_

Ambiente de desenvolvimento do projeto TrailUp. Fonte: Autoria própria (2025).

# GERAÇÃO DO BUILD DO APLICATIVO

> A geração do arquivo de distribuição foi realizada via EAS Build no formato AAB (Android App Bundle), formato exigido atualmente pela Google Play Store.

## Procedimentos

1.  Autenticação no Expo via terminal;

2.  Configuração do arquivo eas.json;

3.  Execução do comando de build;

4.  Processamento do build em nuvem;

5.  Download do arquivo AAB.

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

Execução do build no terminal. Build de exemplo, pois não tirei print do build que subi para produção. Fonte: Autoria própria (2025).

_[imagem omitida — ver original no Drive]_

Build versão 2 do AAB finalizado com sucesso (tinha gerado um arquivo apk e enviado uma versão velha no formato AAB (único aceito pelo Google)). Por isso foi preciso subir outra versão do app para teste interno (vão ser vistas 2 versões na etapa de subir o build). Fonte: Autoria própria (2025).

# SUBMISSÃO NA GOOGLE PLAY STORE

## Criação da Conta no Google Play Console

> Criação da conta de desenvolvedor e pagamento da taxa obrigatória.

_[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]_

Registro da criação da conta developer no google console (foi necessário realizar o pagamento da taxa) e confirmação de identidade, sendo esse um processo um pouco trabalhoso. Fonte: Autoria própria (2025).

## Criação do Aplicativo

> Cadastro do aplicativo com nome, idioma e categoria.

_[imagem omitida — ver original no Drive]_

Criação do aplicativo TrailUp com definições básicas iniciais (criamos uma versão de rascunho para mostrar, pois não foi realizado print no momento da criação). Fonte: Autoria própria (2025).

## Configuração da Ficha da Loja

> Preenchimento da descrição, ícone, screenshots e categorias.

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

Acima temos a sequência de passos para criar a ficha da loja do TrailUp (foi necessário gerar os covers e logos no figma para completar essa etapa). Fonte: Autoria própria (2025).

## Classificação e Segurança

> Definição como Classificação Livre (L) e declaração de dados.

_[imagem omitida — ver original no Drive]_

Classificação indicativa Livre (L). Definida após o preenchimento de um pequeno questionário. Fonte: Autoria própria (2025).

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

_[imagem omitida — ver original no Drive]_

Acima temos a sequência de passos para informar os tipos de dados coletados e compartilhados além de todo o processo envolto na manipulação e disponibilidade dessas informações. Fonte: Autoria própria (2025).

## Envio da Versão para Acesso Antecipado

> _[imagem omitida — ver original no Drive]_
>
> _[imagem omitida — ver original no Drive]_
>
> _[imagem omitida — ver original no Drive]_

Envio do arquivo AAB, juntamente com tags (definindo o idioma) com o nome e as definições da atualização da versão lançada. Fonte: Autoria própria (2025).

## Restrições e Acessos do app

_[imagem omitida — ver original no Drive]_

Configuração dos dados de acesso do app. Foi definido e explicado que o login é restrito principalmente pelo fato de ocorrer no site e não no app. Fonte: Autoria própria (2025).

## Política de Privacidade

_[imagem omitida — ver original no Drive]_

Definição do link da página de privacidade, foi necessário alterações e ajustes no site para adotar políticas aceitas pelo Google. Fonte: Autoria própria (2025).

## Versão de Testes Internos (Google Play Console)

O aplicativo TrailUp não foi publicado em produção na Google Play Store. Todas as versões geradas até o momento foram destinadas exclusivamente ao canal de Testes Internos, disponível no Google Play Console.

Essa modalidade de teste permite que apenas usuários previamente autorizados pelo desenvolvedor tenham acesso ao aplicativo, garantindo maior controle técnico durante a fase inicial de validação.

O processo realizado foi o seguinte:

1.  Upload do arquivo AAB no canal Testes Internos do Google Play Console;

2.  Criação do grupo de testadores por e-mail;

3.  Geração do link restrito de acesso;

4.  Instalação do aplicativo apenas nos dispositivos autorizados (por emails);

5.  Execução de testes funcionais no ambiente real.

Durante essa fase foram testados:

- Sistema de login;

- Sistema de trilhas;

- Sincronização em nuvem via Supabase;

- Estabilidade geral do aplicativo.

_[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]__[imagem omitida — ver original no Drive]_

Telas do aplicativo TrailUp em modo de Teste Interno na Google Play Store. Fonte: Autoria própria (2025).

# RESULTADOS E CONCLUSÃO

O aplicativo TrailUp foi **distribuído com sucesso no modo de Testes Internos da Google Play Store**, permitindo a validação das principais funcionalidades em ambiente controlado.

A versão atual **não se encontra publicada em produção**, estando restrita apenas a usuários convidados para fins de testes acadêmicos.

# REFERÊNCIAS

- Documentação oficial do Expo;

- Documentação do EAS Build;

- Documentação do Google Play Console.
