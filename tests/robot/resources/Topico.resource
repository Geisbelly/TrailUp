*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Keywords ***
Abrir Editor Do Topico De Teste
    Go To    ${BASE_URL_FRONTEND}/console/trilha/${TOPICO_ID}/editar
    Wait For Elements State    css=[placeholder="Ex: Introdução à Lógica"]    visible    timeout=15s

Cadastrar Conteudo De Texto
    [Arguments]    ${titulo}    ${corpo}
    Fill Text    css=[placeholder="Ex: Introdução à Lógica"]    ${titulo}
    Fill Text    css=[placeholder="# Digite seu conteúdo aqui..."]    ${corpo}
    Click    text=Criar Conteúdo
    Wait For Elements State    css=.animate-spin    hidden    timeout=15s
