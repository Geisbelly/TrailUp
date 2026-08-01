*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Keywords ***
Fazer Login Como Professor
    New Browser    chromium    headless=${HEADLESS}
    New Context    baseURL=${BASE_URL_FRONTEND}
    New Page    /login
    Fill Text    css=#email    ${PROFESSOR_EMAIL}
    Fill Text    css=#password    ${PROFESSOR_SENHA}
    Click    css=button[type="submit"]
    Wait For Elements State    text=Trilha    visible    timeout=15s
