*** Settings ***
Library    RequestsLibrary
Library    Collections
Variables    ../variables/staging.py

*** Keywords ***
Obter Token Do Professor De Teste
    Create Session    supabase    ${SUPABASE_URL}
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Content-Type=application/json
    ${body}=    Create Dictionary
    ...    email=${PROFESSOR_EMAIL}
    ...    password=${PROFESSOR_SENHA}
    ${response}=    POST On Session    supabase    /auth/v1/token?grant_type=password
    ...    json=${body}    headers=${headers}    expected_status=200
    Set Suite Variable    ${ACCESS_TOKEN}    ${response.json()}[access_token]
    Set Suite Variable    ${PROFESSOR_UUID}    ${response.json()}[user][id]

Criar Classe De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    ...    Content-Type=application/json
    ...    Prefer=return=representation
    ${body}=    Create Dictionary
    ...    descricao=RF Teste Personalizacao
    ...    materia_id=${None}
    ...    professor_id=${PROFESSOR_UUID}
    ${response}=    POST On Session    supabase    /rest/v1/classe
    ...    json=${body}    headers=${headers}    expected_status=201
    ${criada}=    Set Variable    ${response.json()}[0]
    Set Suite Variable    ${CLASSE_ID}    ${criada}[id]

Criar Topico De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    ...    Content-Type=application/json
    ...    Prefer=return=representation
    @{vazio}=    Create List
    ${body}=    Create Dictionary
    ...    nome=Topico RF Teste
    ...    classe_id=${CLASSE_ID}
    ...    ordem=${1}
    ...    next=${vazio}
    ...    depende=${vazio}
    ${response}=    POST On Session    supabase    /rest/v1/topicos
    ...    json=${body}    headers=${headers}    expected_status=201
    ${criado}=    Set Variable    ${response.json()}[0]
    Set Suite Variable    ${TOPICO_ID}    ${criado}[id]

Remover Dados De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    IF    $TOPICO_ID
        DELETE On Session    supabase    /rest/v1/conteudos?topico_id=eq.${TOPICO_ID}
        ...    headers=${headers}    expected_status=204
        DELETE On Session    supabase    /rest/v1/topicos?id=eq.${TOPICO_ID}
        ...    headers=${headers}    expected_status=204
    END
    IF    $CLASSE_ID
        DELETE On Session    supabase    /rest/v1/classe?id=eq.${CLASSE_ID}
        ...    headers=${headers}    expected_status=204
    END
