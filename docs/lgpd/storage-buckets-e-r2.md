# Arquivos do aluno: buckets privados e ciclo de vida do R2 (#195)

Migrations `api/alembic/versions/20261024_09_buckets_privados.py` (buckets do aluno) e `20261024_10_bucket_conteudos_privado.py` (material do professor) · ciclo de vida em `infra/r2/ciclo-de-vida.json` · script `infra/r2/aplicar-ciclo-de-vida.sh`.

## Onde mora cada arquivo

| Onde | Prefixo / bucket | O que é | Quem grava | O banco referencia? |
|---|---|---|---|---|
| Storage `conteudo_aluno` (e cópia no R2) | `brainhex/<perfil>/classe-N/...` | material gerado por perfil dentro da turma | microservice, brainhexpdf (`render-and-store`) | sim (`conteudo_personalizado.materiais`, `vw_material_storage_paths`) |
| Storage `conteudo_aluno` (e R2) | `fontes/classe-N/...` | fonte enviada na personalização | API | sim (`fontes_personalizacao.storage_path`) |
| Storage `conteudo_aluno` | `<uuid do aluno>/boss/...` | avatar do chefe gerado para o aluno | API (`boss_image.py`) | não (URL assinada de 24 h, devolvida na hora) |
| Storage `perfil_fotos` | `<uuid>/<ts>.<ext>` (antigo: `<uuid>-<ts>.<ext>`) | foto de perfil | app (o próprio aluno) | sim (`alunos.foto_url`) |
| Storage `banners_fotos` | idem | banner do perfil | app (o próprio aluno) | sim (`alunos.banner_url`) |
| R2 | `telemetria/lotes/AAAA/MM/DD/<lote>.json` | lote bruto de telemetria | API (`repositories/telemetria.py`) | `telemetria_lotes.payload->>'_r2'`, até a redação |
| R2 | `telemetria/eventos/AAAA/MM/DD/<uuid>.json` | evento bruto do app | API | `telemetria_eventos_app.payload->>'_r2'`, até o expurgo |
| Storage `conteudos` (e R2) | `<uid do professor>/<tópico>/<ts>_<nome>` | upload do professor (arquivo do conteúdo, mídia de questão, imagem de card, fonte da personalização) | console | sim (`conteudos.conteudo`, `conteudos.metadata.files[].path`/`media_storage_path`, `midias.url`, `questoes.midia_url`, `cards.imagem_url`, `fontes_personalizacao`) |

## Buckets privados

**Decisão:** `conteudo_aluno`, `perfil_fotos` **e `banners_fotos`** ficam privados.

- **Por que `banners_fotos` também fecha:** é o banner do perfil que cada aluno envia, um dado pessoal como a foto. Não é banner de site: a landing page usa arquivos estáticos do repositório. Não há motivo para ser público.
- **Quem lê** (`trailup_pode_ler_arquivo`, política `trailup_le_arquivos_do_aluno` em `storage.objects`):
  - foto e banner: o próprio aluno, colega de alguma turma em comum (ranking, guilda, chat e perfil público já mostram a foto a quem divide turma), professor de alguma turma do aluno e o dono do app;
  - `brainhex/<perfil>/classe-N/`: aluno matriculado em N, professor de N e o dono;
  - `fontes/classe-N/`: professor de N, o dono e o aluno quando a fonte é dele ou não é `individual`;
  - `<uuid>/`: só o próprio aluno e o dono;
  - anônimo e qualquer outro caminho: ninguém. O service role passa por cima do RLS (API, microservice, gateway).
- **Quem grava:** fotos e banners só na pasta/prefixo do próprio uuid (INSERT, UPDATE e DELETE). Antes, qualquer usuário logado podia sobrescrever a foto de outro.
- **Como os arquivos são servidos:**
  - foto e banner: `alunos.foto_url`/`banner_url` guardam a referência `perfil_fotos/<caminho>`. O app troca por uma URL assinada de 1 h (`mobile/src/hooks/useFonteDeImagem.ts`, com cache);
  - material de `conteudo_aluno`: pelo gateway `storage-redirect`, que serve do R2 e, se o objeto não estiver lá, cai numa **URL assinada** do Storage (antes caía na URL pública);
  - URLs públicas antigas gravadas no banco: a API (`material_url_de_leitura`) e o console (`materialPathDaUrlPublica`) convertem para o gateway na leitura. A função de fechamento também as reescreve no banco.
- **Risco residual:** o gateway não exige sessão (opção A). Quem tiver a URL do gateway de um caminho em `vw_material_storage_paths` baixa o arquivo. Exigir JWT no gateway (opção B) pede uma versão nova do app nativo.

### Bucket `conteudos` (material do professor, 20261024_10)

- **Quem lê** (`trailup_pode_ler_conteudo_professor`, política `trailup_le_conteudo_do_professor`):
  - o professor dono (pasta `<uuid>/` do próprio uid) e o dono do app;
  - professor de qualquer turma que USA o arquivo e aluno matriculado nela. "Usa" é por referência, não pelo caminho (`trailup_turmas_que_usam_conteudo`): `conteudos.conteudo`, `metadata.files[].path`, `metadata.media_storage_path`, `midias.url`, `questoes.midia_url` (via atividade), `cards.imagem_url` e `fontes_personalizacao` sem aluno. Por isso turma duplicada, que aponta para o mesmo arquivo da turma de origem, também lê;
  - fonte de personalização `individual`: só o professor da turma (aluno não);
  - a referência pode estar como caminho ou como URL antiga do Storage (`trailup_caminho_arquivo`).
- **Quem grava:** INSERT/UPDATE só na pasta do próprio uid e só professor (ou dono do app); DELETE só na própria pasta. Antes, qualquer logado lia o bucket inteiro e qualquer logado podia subir arquivo.
- **Como é servido:** o console grava o caminho e assina na hora (`createSignedUrl`, sob o RLS); o app assina caminho e URL pública antiga de bucket privado (`exigeAssinatura`); a API e o microservice mandam a fonte do professor para o gateway (o caminho está em `fontes_personalizacao`, coberto pela `vw_material_storage_paths`; o gateway assina em `conteudos` quando o caminho começa com uuid). O resto do material do professor **não** entra na view do gateway, que não exige sessão.
- **Fechamento** (`trailup_fechar_buckets_privados()` passa a fechar os quatro buckets): reescreve para caminho puro `conteudos.conteudo`, `metadata.files[].path`, `metadata.media_storage_path`, `midias.url`, `questoes.midia_url` e `cards.imagem_url`; URL pública de `conteudos` em `fontes_personalizacao.arquivo_url` e em `conteudo_personalizado.materiais` vira URL do gateway. O resultado traz `conteudos_professor` com as contagens. **Reabrir** volta o bucket a público e deixa os caminhos (o console e o app leem caminho dos dois jeitos).
- **URL dentro de texto livre** (20261024_11): o fechamento também troca, dentro do texto, `/storage/v1/object/public/<bucket>/` por `/storage/v1/object/authenticated/<bucket>/` nos quatro buckets (`trailup_reescrever_urls_nos_textos`). Colunas: markdown e metadata de `conteudos`, `topicos`, `atividades`, `questoes`, `cards`, `cards_personalizados`, `conteudo_personalizado`, `personalizacao_blocos_gerados`, `materiais_gerados`, `bag_itens`, `midias.metadata` e `fontes_personalizacao`. Ficam de fora `classe`, `missoes`, `eventos_classe`, `alunos` e `professor`, que têm gatilhos próprios sobre a descrição. A forma `authenticated` não abre sem sessão: o app (`MarkdownBlock`, via `assinarUrlsDoStorageNoTexto`) e o console (`PerfilConteudoView`) assinam essas URLs na leitura, sob o RLS. A API já entendia a forma `authenticated` (`objeto_do_storage`). É idempotente; **reabrir** desfaz a troca.
- **Arquivo citado no texto conta como uso:** `trailup_turmas_que_usam_conteudo` ganhou ramos que procuram `/conteudos/<caminho>` (ou com `%20`) no texto de `conteudos`, `atividades`, `questoes`, `cards`, `conteudo_personalizado`, `cards_personalizados` e `personalizacao_blocos_gerados`. Assim o aluno da turma assina a imagem embutida e o expurgo não apaga um arquivo que outra turma ainda cita. `bag_itens` não entra porque o aluno escreve nela (daria acesso a qualquer arquivo). A busca é por `strpos`, sem índice; as tabelas são pequenas hoje.
- **Sem regerar personalização:** os gatilhos `trg_*_class_delta_job` (conteudos, topicos, atividades, questoes, cards) enfileiram regeração quando essas colunas mudam. As duas funções desligam esses gatilhos durante a reescrita e religam só os que estavam ligados, na mesma transação (`trailup_gatilhos_de_regeracao`). Isso também evita a regeração que o fechamento da 20261024_10 causaria. `ALTER TABLE ... DISABLE TRIGGER` exige o dono da tabela: rode no SQL Editor (usuário `postgres`).
- **Expurgo:** o check de "arquivo ainda em uso" do worker compara via `trailup_caminho_arquivo`, então vale para caminho e URL antiga, e passou a olhar `metadata.media_storage_path`.

### Fechamento em duas etapas

O alembic roda no startup da API, então a migration só cria as funções e as políticas. A URL pública continua funcionando até o passo 4.

1. Publicar a edge function `storage-redirect` (`supabase functions deploy storage-redirect`).
2. Deploy da API, microservice, brainhexpdf, console e app web, e publicar a versão nova do app nativo.
3. **Ligar a versão mínima do app nativo** (só depois que a versão nova estiver nas lojas): em `app_config`, `app_versao_minima` = versão publicada (por exemplo `1.4.0`, o `version` do `app.json`) e `app_atualizacao_url` = link da loja. As duas chaves nascem vazias (`''`), o que deixa a checagem desligada. Com o valor preenchido, o app nativo mais antigo mostra a tela "Atualize o TrailUp" ao abrir (`AtualizacaoObrigatoriaGate`). Web não é afetado.
4. No SQL Editor (usuário `postgres`): `select public.trailup_fechar_buckets_privados();`. A função devolve as contagens do que reescreveu (inclui `urls_em_textos`) e é idempotente.

**Desfazer:** `select public.trailup_reabrir_buckets_publicos('https://<projeto>.supabase.co');`. Com a URL base, as referências dos buckets do aluno voltam a ser URLs públicas; `conteudos` volta a público e mantém os caminhos.

**A cópia para o R2** (`scripts/copiar-storage-para-r2.ts`) lê a origem pela rota autenticada do Storage com a chave de serviço, então continua funcionando com os buckets fechados.

**Depois do passo 4, o app nativo antigo** perde as fotos e banners: a referência não é URL. Por isso o passo 3 obriga a atualização antes. Uma falha ao ler `app_config` não bloqueia o app.

## Ciclo de vida do R2

**Regra:** só a telemetria bruta expira sozinha. Nada que o banco referencia tem expiração automática. Esses arquivos saem pelo expurgo (`retencao_fila_externa`), que confere se outra linha ainda usa o arquivo.

| Regra | Prefixo | Expira | Por quê |
|---|---|---|---|
| `telemetria-lotes-expira-200d` | `telemetria/lotes/` | 200 dias | O banco redige o lote em 90 dias, ou 180 com consentimento de pesquisa (`DIAS_BRUTA`/`DIAS_BRUTA_PESQUISA`). A redação apaga o ponteiro `_r2`. Margem de 20 dias para o worker. |
| `telemetria-eventos-expira-200d` | `telemetria/eventos/` | 200 dias | O evento bruto é apagado em 90 ou 180 dias. Mesma margem. |
| `abortar-uploads-incompletos-7d` | todo o bucket | upload incompleto em 7 dias | Recria a regra padrão do R2, que o `lifecycle set` substitui. |

Também abortam uploads incompletos de telemetria em 2 dias. O teste `api/tests/test_r2_ciclo_de_vida.py` confere três coisas: que o prazo é maior que o do banco mais a margem, que nenhum caminho referenciado (`brainhex/`, `fontes/`, `<uuid>/`) é coberto, e que os prefixos batem com o código.

### Como aplicar (Geisbelly)

> **Só depois que `app_config.retencao_modo = 'aplicar'` estiver valendo.** Em `simular`, o banco não redige nem apaga, e a regra de 200 dias apagaria telemetria que o banco ainda referencia.

1. `npx wrangler login`, com uma conta que tenha a permissão "Workers R2 Storage Write".
2. `infra/r2/aplicar-ciclo-de-vida.sh listar <bucket>`: confira se há regra criada à mão que precise entrar no JSON. O `set` substitui todas as regras.
3. `infra/r2/aplicar-ciclo-de-vida.sh aplicar <bucket> --confirmo-modo-aplicar`.

Sem wrangler, use a API REST: exporte `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` no seu terminal e rode `... api <bucket> --confirmo-modo-aplicar`. O script não grava nem imprime esses valores.

O `<bucket>` é o valor de `R2_BUCKET` da API.
