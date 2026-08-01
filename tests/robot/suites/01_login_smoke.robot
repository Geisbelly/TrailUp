*** Settings ***
Resource    ../resources/Login.resource
Suite Teardown    Close Browser

*** Test Cases ***
Professor Consegue Logar E Ver O Console
    Fazer Login Como Professor
