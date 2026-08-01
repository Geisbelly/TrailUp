*** Settings ***
Resource    ../resources/Login.resource
Resource    ../data/ApiSetup.resource
Resource    ../resources/Topico.resource
Suite Setup       Preparar Sessao De Teste
Suite Teardown    Encerrar Sessao De Teste

*** Keywords ***
Preparar Sessao De Teste
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste
    Fazer Login Como Professor

Encerrar Sessao De Teste
    Remover Dados De Teste
    Close Browser

*** Test Cases ***
Professor Cadastra Conteudo De Texto No Topico
    Abrir Editor Do Topico De Teste
    Cadastrar Conteudo De Texto    Conteudo RF Teste Automatizado    Corpo de teste gerado pela suite Robot Framework.
