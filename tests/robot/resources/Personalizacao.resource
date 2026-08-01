*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Variables ***
@{PERFIS_BRAINHEX_LABELS}    Explorador    Sobrevivente    Aventureiro    Estrategista    Conquistador    Socializador    Realizador

*** Keywords ***
Abrir Aba Personalizacoes
    Go To    ${BASE_URL_FRONTEND}/console
    Click    text=Personalizações
    Wait For Elements State    text=Por perfil    visible    timeout=15s

Selecionar Classe Topico E Conteudo Para Personalizacao
    [Arguments]    ${nome_classe}    ${nome_topico}    ${titulo_conteudo}
    Click    css=button[role="combobox"] >> nth=0
    Click    css=[role="option"] >> text=${nome_classe}
    Click    css=button[role="combobox"] >> nth=1
    Click    css=[role="option"] >> text=${nome_topico}
    Click    css=button[role="combobox"] >> nth=2
    Click    css=[role="option"] >> text=${titulo_conteudo}
    Click    text=Atualizar

Aguardar Geracao Dos 7 Perfis
    Wait Until Keyword Succeeds    ${TIMEOUT_GERACAO}    15s    Recarregar E Verificar Todos Os Perfis

Recarregar E Verificar Todos Os Perfis
    Click    text=Atualizar
    FOR    ${label}    IN    @{PERFIS_BRAINHEX_LABELS}
        Wait For Elements State
        ...    css=[aria-label="Geração para o perfil ${label}"] >> text=Ver conteúdo completo
        ...    visible    timeout=8s
    END
