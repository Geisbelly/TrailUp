# Mapeamento dos prints → telas → prompts

Renomeei os 23 prints originais de acordo com o que cada um mostra e organizei em uma pasta por tela, junto do prompt correspondente. Achado importante: **só 6 dos 23 prints são do console do professor** (o que este redesign cobre) — o resto é a landing page pública, blog, cadastro e login, que não fazem parte do escopo dos prompts.

## Console do professor (dentro de `telas/`)

| Pasta | Print(s) dentro dela | O que o print mostra |
|---|---|---|
| `telas/00-dashboard/` | `console-dashboard-01-kpis.png` | Dashboard — topo, os 8 cards de indicadores |
| | `console-dashboard-02-graficos-lista-alunos.png` | Mesma tela, rolada: gráficos "Abandono por Perfil"/"Distribuição de Notas" + "Lista de Alunos" |
| `telas/01-trilha/` | `console-trilha-01-vazio.png` | Trilha — estado vazio (nenhuma classe selecionada ainda) |
| `telas/02-turmas/` | `console-classes-01-vazio.png` | Classes — estado vazio ("Nenhuma turma ainda") |
| `telas/03-personalizacoes/` | `console-personalizacoes-01-vazio.png` | Personalizações — estado vazio, mas mostra as 4 sub-abas reais: **Por perfil, Estrutura e paleta, Por aluno, Turma** (no código os values são `por-perfil/estrutura/por-aluno/grupo` — os rótulos na tela são esses; já corrigi o prompt pra usar os rótulos certos) |
| `telas/04-ranks/` | `console-ranks-01-carregando.png` | Ranks — estado de carregamento |
| `telas/05-meus-dados/` | `console-meus-dados-01-informacoes-pessoais.png` | Topo: Informações Pessoais + toggle de geração automática |
| | `console-meus-dados-02-zona-perigo-senha.png` | Mesma tela, rolada: Zona de Perigo + Alterar Senha |
| `telas/06-aprovacoes/` | *(nenhum)* | Só a dona do projeto vê essa aba — a conta usada pra tirar os prints não é a dela |

## Fluxo de autenticação (dentro de `telas/`, por último na fila)

| Pasta | Print(s) dentro dela | O que o print mostra |
|---|---|---|
| `telas/07-login/` | `auth-login-professor.png` | Tela de login do professor |
| `telas/08-recuperar-senha/` | *(nenhum)* | Tela de curta duração, não ficou capturada — descrita por escrito no prompt |
| `telas/09-cadastro-conta/` | `cadastro-aluno-email.png` | Cadastro de aluno — só o primeiro passo (pedir e-mail) |
| | `cadastro-professor-email.png` | Cadastro de professor — só o primeiro passo (pedir e-mail) |
| `telas/10-finalizar-cadastro/` | *(nenhum)* | Tela de curta duração (só se passa por ela uma vez), não ficou capturada — descrita por escrito no prompt, incluindo o questionário BrainHex |

**Importante sobre esses prints:** a conta usada não tem nenhuma turma/aluno cadastrado, então **todas as 6 telas do console aparecem vazias ou carregando** — nenhuma mostra dado real (gráfico populado, lista de alunos preenchida, ranking com posições). Isso é uma limitação real dos prints, não do redesign. Por isso cada `prompt.md` já inclui, logo no início, um aviso de que os prints anexados servem só pra mostrar "como a tela está hoje" — os dados reais que cada tela mostra quando populada estão descritos por escrito no próprio prompt.

## Fora do escopo, em `referencia-visual-extra/`

Não fazem parte do console e não têm prompt próprio — mas mostram a identidade visual da marca "por fora" (útil como referência de tom, opcional de anexar no prompt mestre):

| Print | O que é |
|---|---|
| `landing-01-hero.png` | Home pública — seção hero |
| `landing-02-guardioes-brainhex.png` | Home pública — showcase dos 7 guardiões BrainHex |
| `landing-03-por-que-escolher.png` | Home pública — grade de features |
| `landing-04-download-app-footer.png` | Home pública — CTA de download + rodapé |
| `landing-05-teaser-app-mobile.png` | Home pública — seção "app mobile" |
| `sobre-01-missao.png` | Página "Sobre" — missão |
| `sobre-02-valores-historia.png` | Página "Sobre" — valores + início da história |
| `sobre-03-historia-tecnologia-footer.png` | Página "Sobre" — história + tecnologia, rodapé |
| `blog-01-lista-artigos.png` | Blog — lista de artigos |
| `blog-02-lista-artigos-scroll.png` | Blog — lista de artigos, rolada |
| `contato.png` | Página de contato |
| `_fora-do-escopo_mobile-lembrete-diario.png` | Print do **app mobile** (issue anterior) — não é o frontend web, não relacionado a este redesign |

(`auth-login-professor.png`, `cadastro-aluno-email.png` e `cadastro-professor-email.png` saíram daqui — agora moram em `telas/07-login/` e `telas/09-cadastro-conta/`, porque acabaram entrando no escopo deste redesign também.)

## Como usar isso na prática

Ao colar o `prompt.md` de uma pasta em `telas/` na ferramenta de design, anexe junto **só os prints que estão naquela mesma pasta** — eles já vêm juntos, então é só arrastar a pasta inteira ou os arquivos dela. Os prints de `referencia-visual-extra/` servem só de pano de fundo geral de identidade, opcionais de anexar no prompt mestre (`telas/00-dashboard/prompt.md`).
