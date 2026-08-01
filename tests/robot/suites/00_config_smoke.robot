*** Settings ***
Variables    ../variables/staging.py

*** Test Cases ***
Variaveis De Ambiente Devem Carregar
    Should Not Be Empty    ${BASE_URL_FRONTEND}
    Should Not Be Empty    ${BASE_URL_API}
    Should Not Be Empty    ${SUPABASE_URL}
    Should Not Be Empty    ${SUPABASE_ANON_KEY}
    Should Not Be Empty    ${PROFESSOR_EMAIL}
    Should Not Be Empty    ${PROFESSOR_SENHA}
    Log    Timeout de geracao configurado: ${TIMEOUT_GERACAO}
    Log    Modo headless: ${HEADLESS}
