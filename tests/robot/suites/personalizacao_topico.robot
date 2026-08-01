*** Settings ***
Resource    ../resources/Login.resource
Resource    ../resources/Topico.resource
Resource    ../resources/Personalizacao.resource
Resource    ../data/ApiSetup.resource
Variables    ../variables/staging.py

Suite Setup       Preparar Dados De Teste
Suite Teardown    Limpar Dados De Teste

*** Variables ***
${NOME_CLASSE}          RF Teste Personalizacao
${NOME_TOPICO}          Topico RF Teste
${TITULO_CONTEUDO}      Conteúdo RF Teste Automatizado
${CORPO_CONTEUDO}       Conteudo de teste gerado automaticamente pela suite Robot Framework de personalizacao.

*** Keywords ***
Preparar Dados De Teste
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste

Limpar Dados De Teste
    Remover Dados De Teste
    Close Browser

*** Test Cases ***
Professor Cadastra Conteudo E Personalizacao E Gerada Para Os 7 Perfis
    Fazer Login Como Professor
    Abrir Editor Do Topico De Teste
    Cadastrar Conteudo De Texto    ${TITULO_CONTEUDO}    ${CORPO_CONTEUDO}
    Abrir Aba Personalizacoes
    Selecionar Classe Topico E Conteudo Para Personalizacao
    ...    ${NOME_CLASSE}    ${NOME_TOPICO}    ${TITULO_CONTEUDO}
    Aguardar Geracao Dos 7 Perfis
