*** Settings ***
Resource    ../resources/Login.resource
Resource    ../resources/Personalizacao.resource
Suite Teardown    Close Browser

*** Test Cases ***
Professor Abre Aba De Personalizacoes
    Fazer Login Como Professor
    Abrir Aba Personalizacoes
