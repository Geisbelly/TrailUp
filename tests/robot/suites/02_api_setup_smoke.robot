*** Settings ***
Resource    ../data/ApiSetup.resource
Suite Teardown    Remover Dados De Teste

*** Test Cases ***
Setup De Dados De Teste Via API
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste
    Should Not Be Empty    ${CLASSE_ID}
    Should Not Be Empty    ${TOPICO_ID}
