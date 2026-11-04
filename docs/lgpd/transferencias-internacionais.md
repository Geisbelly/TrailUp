# Registro de transferência internacional de dados pessoais (LGPD, arts. 33 a 36)

- **Controlador:** projeto TrailUp (pesquisa acadêmica, Ulbra Palmas). Responsável pelo registro: Geisbelly Victória.
- **Encarregado (art. 41):** **pendente**. Falta um e-mail institucional do encarregado. Hoje o canal público é a página `/contato` do site.
- **Estado descrito:** `main` em 24/10/2026, já com #613, #616, #618, #619 e #620.
- **Revisão:** sempre que entrar ou mudar um serviço externo que recebe dado pessoal (ver [Regra de processo](#regra-de-processo)). Próxima revisão programada: antes de ampliar o piloto.
- **Como o registro foi feito:** levantamento no código + fontes públicas dos fornecedores. Na produção, só foram lidos metadados (região do projeto Supabase, lista de edge functions, `alembic_version`); nenhum valor de variável de ambiente ou segredo foi lido.
- **"não confirmado"** = não há evidência no código, na configuração versionada nem em fonte pública. Precisa ser conferido no painel ou no contrato.

Legenda: **M** = pode incluir dado de menor de 18 · **S** = dado sensível ou de alto risco (imagem do rosto, estado emocional inferido, perfil psicológico) · **ID** = identificado · **PS** = pseudonimizado (UUID ou referência `A1…`) · **AN** = sem dado pessoal.

---

## 1. Estado atual (o que mudou desde o levantamento de 24/10)

1. **Nome e e-mail do aluno fora dos prompts de IA (#618).**
   - O agente de texto e o mentor recebem `{{nome}}`; insights da turma e escriba recebem referências `A1…An`. O nome volta só no servidor da TrailUp.
   - **Não vai mais (04/11/2026):** o UUID do aluno. Saía no pedido do mentor (`aluno.id`) e no resumo de estado do supervisor (`aluno_id`), e nenhum prompt o usava; os dois saíram, com teste (`api/tests/test_uuid_do_aluno_fora_do_prompt.py`). O microservice recebe o UUID da API, mas só para ler o Supabase: não o repassa ao Gemini nem ao BrainHexPDF.
   - **Ainda vão:** texto livre do aluno (mensagem ao mentor, redação), que pode conter outros dados pessoais, e nomes com grafia diferente da cadastrada (a troca diferencia acentos e não conhece apelidos no escriba).
2. **Menor de 18 ou sem data de nascimento → sem IA nenhuma (04/11/2026).** Substitui a rota para a OpenAI (#619), que a #886 tinha desligado por padrão (`IA_ROTA_DE_MENOR_ATIVA=false`) e que, desligada, levava menor ao Gemini. A variável saiu: a regra vale sempre.
   - A rota é decidida no servidor por aluno (`public.aluno_eh_menor`, data de nascimento do #613). Na dúvida (sem data, erro na consulta), vale a rota de menor.
   - Na rota de menor nenhuma chamada sai: nem Gemini, nem OpenAI, nem RAG, nem TTS (Gemini, gTTS ou OpenAI), nem imagem, nem o microservice de mídia. Onde existe texto local de reserva, ele aparece; o mentor responde 403 com o motivo.
   - A autorização do responsável (#613) continua ligando câmera, telemetria, emoção e pesquisa, mas **não libera a IA**.
   - Turma com pelo menos um aluno não confirmado adulto (insights, escriba/Lumi, análise de alteração do professor) → a chamada inteira não sai.
   - Edge function de correção de redação (`validate-essay-answer-ai`): mesma regra, via `aluno_meu_consentimento()`; menor recebe 503 com a mensagem.
3. **IA só para maiores de idade confirmados.** O TrailUp é usado com maiores na faculdade (decisão da Geisbelly, 24/10/2026; estendida a toda a IA em 04/11/2026).
4. **Emoções vão completas para a IA**, por decisão da Geisbelly (24/10/2026). O rótulo de emoção inferido, sem a imagem, entra nos prompts de personalização.
5. **LangSmith travado em produção** (`app/core/tracing.py`): fora de dev/test o tracing é forçado a desligado, a menos que `LANGSMITH_TRACING_AUTORIZADO_EM_PRODUCAO=true`. Isso depende de `APP_ENV` estar certo em produção (não confirmado).
6. **Chave do Gemini no header `x-goog-api-key`**, não mais na URL (#618).
7. **Correção do levantamento anterior — análise de imagem da câmera.** O rascunho de 24/10 tratava a câmera como se não houvesse análise de imagem em uso. **Isso estava incompleto:** a análise real existe na `main` desde o PR #305 (07/10/2026). Ver a seção 3.

---

## 2. Registro por fornecedor

| # | Destinatário (papel) | Dados que saem | M/S | ID/PS | Finalidade | País/região | Treina com os dados? | Retenção no provedor | Base legal / mecanismo hoje | Pendência | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Supabase** (operador; infra AWS) | Banco inteiro: auth (e-mail, login Google), perfis, turmas, telemetria, emoção inferida, BrainHex, consentimentos, Storage (materiais, fontes), edge functions | M, S | ID | Banco, autenticação, storage, edge functions | **EUA – us-west-2** (metadado do projeto). Logs da plataforma na UE; suporte global | Não (operador) | Enquanto o projeto existir; backups conforme o plano (não confirmado). Prazos internos: ver `retencao_politica` | DPA da Supabase com SCCs da UE. CPC da ANPD: não confirmado | Adotar as **cláusulas-padrão da ANPD** (Res. CD/ANPD 19/2024) ou migrar para `sa-east-1` | [FAQ de residência](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq) · [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) |
| 2 | **Hetzner** (operador; VPS com Dokploy: API FastAPI, workers, microservice, brainhexpdf) | Tudo que passa pela API: token, telemetria, **imagens da câmera** (quando ligada e autorizada; ver seção 3), prompts, PDFs | M, **S** | ID | Backend e **análise local de emoção por imagem** | **EUA – Ashburn/VA** (geolocalização do IP do VPS) | Não | Imagens: não são gravadas (só em memória). Disco e logs do VPS: não confirmado | DPA da Hetzner (aceito no painel). CPC da ANPD: não confirmado | CPC da ANPD, ou mover o VPS para DE/FI (UE = país adequado, Res. CD/ANPD 32/2026). Trocar o TLS `*.traefik.me` autoassinado por domínio próprio | [Proteção de dados Hetzner](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/) · [DPA](https://www.hetzner.com/AV/DPA_en.pdf) |
| 3 | **Vercel** (operador) | Console do professor e proxy `/trailup-api/*`: tráfego da API web, inclusive dados de alunos vistos pelo professor; IP e user agent | M | ID | Hospedagem do site e proxy reverso | EUA/global (edge) | Não | Logs conforme o plano (não confirmado) | DPA da Vercel (SCCs UE 2021 + IDTA UK). CPC da ANPD: não confirmado | CPC da ANPD | [DPA](https://vercel.com/legal/dpa) |
| 4 | **Google – Gemini API** (provedor principal de LLM **só para adultos confirmados**) | Para maiores de 18 confirmados: prompts de personalização (sem o UUID do aluno desde 04/11/2026), **emoção inferida completa**, BrainHex, desempenho; mensagem e histórico do mentor (sem o nome cadastrado); insights e escriba com refs `A1…`; redação do aluno; resumo multimodal de fontes; TTS; imagens. Conteúdo sem aluno (missão diária, tema do mapa, material base) também | S | PS (e ID se o texto livre citar dados) | Personalização, mentor, correção, insights ao professor, geração de mídia | EUA/global ("may be stored transiently or cached in any country") | **Plano gratuito: sim, com revisão humana. Pago: não** | Pago: logs de abuso por período limitado. Gratuito: não informado | Nenhum mecanismo do art. 33 formalizado | **Confirmar o plano pago** de cada chave (há rodízio de chaves e indício de uso gratuito). Os termos do Gemini (em vigor desde 23/03/2026) exigem 18 anos e proíbem app "likely to be accessed by individuals under the age of 18". Desde 04/11/2026 nenhum dado de menor vai à IA, mas **o app ainda aceita menor** (trilha, questões e progresso, com material-base gerado pelo Gemini): o risco contratual só some se o cadastro barrar menores; **decidir e registrar**. CPC da ANPD ou consentimento específico | [Termos adicionais da Gemini API](https://ai.google.dev/gemini-api/terms) · [Termos do Google Cloud (Generative AI, "Age Restrictions")](https://cloud.google.com/terms/service-terms) |
| 5 | **OpenAI** (reserva para adultos confirmados; enriquecimento de conteúdo; RAG; **nunca para menor** desde 04/11/2026) | Para adultos confirmados, quando o Gemini falha: os mesmos prompts da linha 4. RAG: consulta; o vector store só tem corpus público | M, S | PS (e ID se o texto livre citar dados) | LLM, TTS, RAG | EUA | **Não** por padrão (API) | `store=false` em todas as chamadas com dado de aluno. Logs de monitoramento de abuso até 30 dias; files e vector stores até a exclusão + 30 dias; ZDR só com aprovação | DPA da OpenAI (SCCs da UE). CPC da ANPD: não confirmado | ZDR deixou de ser necessária para menores (nenhum dado de menor vai à OpenAI); CPC da ANPD | [Your data](https://platform.openai.com/docs/guides/your-data) · [Diretriz para menores de 18](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) |
| 6 | **Expo** (push) → **FCM (Google)** / **APNs (Apple)** | Token do aparelho + título e corpo da notificação | M | PS (token); ID se o texto citar o nome | Notificações | EUA | Não | Fila até a entrega; recibos 24 h; token guardado | Política/DPA da Expo. CPC da ANPD: não confirmado | CPC da ANPD; conferir que o texto das notificações não leva nome | [FAQ de push](https://docs.expo.dev/push-notifications/faq) · [Privacidade Expo](https://expo.dev/privacy) |
| 7 | **Cloudflare R2** (operador) | Objetos de telemetria (`_r2` nos lotes), mídia e materiais | M, S? | PS/ID | Storage de objetos | **Não confirmado**: sem jurisdição no endpoint; o local automático é a região mais próxima de quem criou o bucket | Não | Até a exclusão (a fila `retencao_fila_externa` apaga junto com o banco) | DPA da Cloudflare. CPC da ANPD: não confirmado | **Conferir o local do bucket no painel** (a jurisdição só se escolhe na criação); CPC da ANPD | [Local dos dados no R2](https://developers.cloudflare.com/r2/reference/data-location/) |
| 8 | **Google Apps Script / Gmail** (operador; envia pelo `MailApp` da conta Google que publicou o script) | Contato pelo app (`fn_enviar_contato`, com sessão) e pelo site público (`fn_enviar_contato_publico`): nome, e-mail, assunto, mensagem. **Aviso de conta inativa** (`retencao_avisos_email`): e-mail do titular e a data-limite | M | ID | Entregar a mensagem de contato à caixa do projeto; avisar o titular antes de apagar a conta inativa | EUA/global | Não informado | Cópia na pasta **Enviados** da conta do script, até alguém apagar; registro de execução do Apps Script | Termos do Google da conta usada. **Conta Gmail pessoal não tem DPA**; com Workspace, vale o aditivo de tratamento de dados do Workspace. CPC da ANPD: não confirmado | Publicar o script numa conta **Workspace** (ou institucional) em vez de pessoal; limpar a pasta Enviados periodicamente; CPC da ANPD | `scripts/apps-script-email/` · `api/alembic/versions/20261101_14_email_pelo_apps_script.py`. **Brevo saiu** em 01/11/2026 (substituída por esta linha; a chave antiga deve ser desativada no painel da Brevo) |
| 9 | **Caixa de e-mail de destino do contato** (onde o Apps Script entrega) | O mesmo da linha 8 | M? | ID | Ler e responder o contato | Depende do provedor da caixa configurada. Hoje é `app_config.dono_email`, uma conta pessoal de webmail (EUA); o endereço não é repetido aqui | Conforme o provedor | Conforme o provedor | Nenhum específico | Definir um **e-mail do encarregado/institucional** e gravá-lo em `app_config.contato_email_destino` | `app_config` (servidor). **formsubmit.co saiu** em 24/10/2026: o site deixou de usá-lo e o e-mail sumiu do frontend |
| 10 | **Visualizadores Microsoft Office Online / Google Docs** | URL do arquivo + IP de quem abre; o provedor baixa o arquivo | M (IP) | ID (IP) | Pré-visualizar .docx/.pptx/.pdf | EUA/global | Não informado | Não confirmado | Nenhum | Usar só com material público do professor, ou renderizar localmente | `view.officeapps.live.com`, `docs.google.com/gview` no mobile e no frontend |
| 11 | **YouTube** (embed) | IP, aparelho, o que foi assistido | M | ID (IP/cookie) | Vídeo do material | EUA | Política do Google | Política do Google | Nenhum | Usar `youtube-nocookie` | `react-native-youtube-iframe` |
| 12 | **Google Sign-In** | Evento de login (o Google é a fonte do dado) | M | ID | Login | EUA | — | — | Relação direta do usuário com o Google | Citado na Privacidade | Client IDs no frontend/mobile |
| 13 | **gTTS** (endpoint não oficial do Google Tradutor) | Texto do roteiro de áudio (só adultos confirmados; desligado na rota de menor) | AN (normalmente) | AN | TTS de reserva | EUA/global | Não informado | Não informado | Sem contrato (API não oficial) | Trocar ou remover | `api/app/services/audio.py` |
| 14 | **Google Fonts** | IP | — | ID (IP) | Fontes | EUA | — | — | — | Fazer self-host | `fonts.googleapis.com` |
| 15 | **LangSmith** (tracing) | Estado do grafo, se ligado | M, S | ID | Depuração | EUA | — | — | **Travado em produção no código** (#618) | Confirmar `APP_ENV` em produção | `api/app/core/tracing.py` |
| — | `esm.sh`, `deno.land`, `picsum.photos` | Sem dado pessoal (imports de código; texto de prompt de imagem) | AN | AN | — | — | — | — | Fora do registro | — | — |

Não há Sentry nem SDK de analytics no mobile, no frontend, no microservice nem no brainhexpdf (conferido nos `package.json`).

---

## 3. Câmera e análise de emoção por imagem

- **A câmera é opt-in e vem desligada.** Para menores, ela só liga com a autorização do responsável, item por item (#613). A API só passa as imagens ao pipeline quando as finalidades `camera` **e** `emocional` estão permitidas para o aluno (`api/app/api/v1/telemetria.py`); no modo restrito, as imagens são descartadas.
- **Onde é analisada:** no servidor da TrailUp (VPS Hetzner, EUA). **Nenhuma imagem vai a provedor externo** (nem Gemini, nem OpenAI): para os LLMs vai só o rótulo de emoção inferido.
- **Como (desde o PR #305, 07/10/2026):** `api/app/services/emotion_vision.py`, `LocalVisionEmotionAnalyzer`, com onnxruntime em CPU.
  - Detector de rosto **YuNet** (`face_detection_yunet_2023mar.onnx`, [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)). Licença do modelo: **MIT** ([LICENSE](https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE)).
  - Classificador de emoção **FER+** (`emotion-ferplus-8.onnx`, [ONNX Model Zoo](https://github.com/onnx/models/tree/main/validated/vision/body_analysis/emotion_ferplus)). Licença do modelo: **MIT**, declarada no README do modelo (o repositório `onnx/models` como um todo é Apache-2.0). Os termos dos dados de treino (FER2013 / rótulos FER+) não foram conferidos (não confirmado).
  - Os modelos são abertos, baixados no build da imagem Docker e conferidos por SHA256 em `/opt/models` (`api/Dockerfile`).
- **O que fica:** os bytes da imagem existem só em memória durante a análise. **Não são gravados:** nem o JPEG, nem o recorte do rosto, nem as probabilidades por imagem. Os frames são retirados do payload antes de gravar `telemetria_lotes` e `ia_decision_logs`. Fica só o resultado (rótulo, valência, confiança), em `aluno_mental_state_history`, por **30 dias**.
- **Ligado por configuração:** o padrão é `emotion_model_provider = "deepface"`, nome histórico de uma **heurística por regras** que não olha a imagem. A análise por imagem liga com `EMOTION_MODEL_PROVIDER=local_vision` no app da API. O valor em produção não foi lido neste levantamento (não confirmado). Mesmo com a heurística, as imagens chegam ao VPS quando a câmera está ligada e autorizada.
- **Transferência:** a imagem do rosto atravessa a fronteira até o VPS nos EUA. É o dado de maior risco do registro. Mover o VPS para a UE resolve a transferência dela.

## 4. Inferência emocional (decisão de 24/10/2026)

- **Finalidade:** adaptar a experiência de estudo (ritmo, tema, oferta de apoio) e sinalizar ao professor quem precisa de apoio. Não entra em nota, ranking nem punição; não é diagnóstico.
- **O professor vê só a faixa** ("precisa de apoio" / "ok"). Não vê score bruto, série histórica nem imagem.
- **Revisão:** o aluno e o responsável podem contestar e desligar a personalização emocional sem perder funções; o professor pode desconsiderar o alerta.
- Decisão completa: [comentário na #195](https://github.com/BitStudioLabs/trail-up/issues/195#issuecomment-6379616985).

## 5. Mecanismo de transferência: situação e pendências

- Os EUA não têm adequação reconhecida pela ANPD; a UE tem (Res. CD/ANPD 32/2026). [Regulamentações da ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd)
- Sem país adequado, a transferência precisa de um mecanismo do art. 33. As cláusulas-padrão contratuais da ANPD ([Res. CD/ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)) precisam ser adotadas **na íntegra**, e o prazo de adequação acabou em 23/08/2025. SCC europeia ≠ CPC da ANPD.
- **Pendências abertas:**
  1. Escolher o mecanismo: CPC da ANPD em cada contrato e/ou consentimento específico e destacado (art. 33, VIII) num termo v6 que cite países e riscos.
  2. Gemini: confirmar o plano pago e decidir se o cadastro passa a barrar menores (hoje eles usam o app sem IA, ver linha 4).
  3. OpenAI: ZDR só volta a ser pendência se a OpenAI voltar a receber dado de menor.
  4. R2: conferir o local do bucket.
  5. Definir o e-mail do encarregado e configurá-lo em `app_config.contato_email_destino` (o formulário público já usa o envio pelo banco, e o formsubmit saiu).
  8. Apps Script de e-mail: publicar numa conta Workspace/institucional (conta pessoal não tem DPA) e desativar a chave antiga no painel da Brevo.
  6. Hetzner: avaliar a mudança do VPS para a UE e trocar o TLS autoassinado.
  7. Confirmar `APP_ENV` (trava do LangSmith) e o valor de `EMOTION_MODEL_PROVIDER` em produção.
- **Contratos assinados (DPA/CPC):** ficam fora do repositório (Drive do projeto), referenciados aqui por nome e data quando existirem. Hoje: nenhum registrado.

---

## Regra de processo

1. **Serviço externo novo, ou mudança no que é enviado a um serviço existente, com dado pessoal** → atualizar este registro no mesmo PR (dados, finalidade, país, treino, retenção, mecanismo, pendência, fonte). O template de PR (`.github/pull_request_template.md`) pergunta isso.
2. **Imagens da câmera:** qualquer mudança no uso delas exige atualizar este registro e passar por revisão na #195 (ou na issue que a suceder) **antes** do merge. Isso vale para armazenar imagem ou recorte, enviar a terceiro (inclusive a provedor de IA), trocar ou adicionar modelo, ou usar para nova finalidade. Uma flag de configuração não substitui essa revisão.
3. **Teste estático:** `api/tests/test_registro_transferencias.py` falha se aparecer no código da API, nas migrations ou nas edge functions um host externo (URL literal ou domínio de provedor conhecido de IA/armazenamento/e-mail/push) ou um SDK de IA que não esteja na lista abaixo.
   - **Limite:** não pega host que vem só de variável de ambiente nem SDK fora da lista do teste. Revisão humana continua necessária.

### Hosts externos conhecidos (lidos pelo teste)

Um host por linha, entre crases. `*.` vale para qualquer subdomínio.

- `generativelanguage.googleapis.com`: Gemini (linha 4)
- `api.openai.com`: OpenAI (linha 5)
- `*.r2.cloudflarestorage.com`: Cloudflare R2 (linha 7)
- `*.supabase.co`: Supabase (linha 1)
- `exp.host`: Expo push (linha 6)
- `script.google.com`: Google Apps Script que envia os e-mails (linha 8)
- `script.googleusercontent.com`: resposta do Apps Script, conferida pelo aviso de conta inativa (linha 8)
- `api.brevo.com`: Brevo, provedor anterior da linha 8; só em migrations antigas (o banco não chama mais)
- `fonts.googleapis.com`: Google Fonts (linha 14)
- `translate.google.com`: gTTS (linha 13)
- `api.smith.langchain.com`: LangSmith (linha 15)
- `esm.sh`: imports de código das edge functions (sem dado pessoal)
- `deno.land`: imports de código das edge functions (sem dado pessoal)
- `trailup.vercel.app`: console web do projeto na Vercel (linha 3), só o link de entrada no e-mail de aviso; não é um terceiro novo
- `*.trailup.app`: domínios próprios do projeto (servidos pela infraestrutura das linhas 2 e 3; não é um terceiro novo)
