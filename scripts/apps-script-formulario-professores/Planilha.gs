/**
 * Planilha de inscrições da pesquisa com professores: aprovação, contas e e-mails personalizados.
 *
 * Mesmo projeto do Apps Script de Code.gs (os formulários). As respostas da inscrição caem numa
 * planilha; a equipe marca "Aprovado" na coluna Decisão, e `processarAprovados` leva cada aprovado
 * pelos quatro passos, um de cada vez, gravando a data de cada um na própria linha:
 *
 *   1. Conta criada em         a edge function `pesquisa-acesso` cria o professor (e-mail ainda não
 *                              confirmado), o aluno de teste e a turma de demonstração;
 *   2. Confirmação enviada em  e-mail personalizado com o link que confirma o endereço;
 *   3. E-mail confirmado em    a função conta quem já abriu o link;
 *   4. Acesso enviado em       só para quem confirmou: senhas novas, aleatórias, e e-mail com os
 *                              acessos de professor e de aluno de teste e o link da avaliação.
 *
 * A senha passa por esta execução e vai direto para o e-mail: não é gravada na planilha, no
 * registro de execução nem nas propriedades.
 *
 * Os textos dos e-mails ficam na aba "Modelos de e-mail" e podem ser editados ali, com os campos
 * {{nome}}, {{primeiro_nome}}, {{email}}, {{link_confirmacao}}, {{senha_professor}},
 * {{aluno_email}}, {{senha_aluno}}, {{turma}}, {{link_login}}, {{link_app}},
 * {{link_avaliacao}}, {{link_aba_avaliacao}} e {{link_cartilha}}.
 * Uma linha só com [[Texto do botão|{{link_...}}]] vira um botão.
 *
 * Propriedades do script (Configurações do projeto → Propriedades do script):
 *   PESQUISA_FUNCAO_URL        https://<ref>.supabase.co/functions/v1/pesquisa-acesso
 *   PESQUISA_FUNCAO_SEGREDO    o mesmo valor de PESQUISA_ACESSO_SEGREDO nos secrets da função
 *   PESQUISA_FORM_INSCRICAO_ID id do formulário de inscrição (o trecho entre /d/ e /edit)
 *   PESQUISA_LINK_AVALIACAO    link de resposta do formulário de avaliação
 *   PESQUISA_SITE_URL          endereço do sistema usado na pesquisa (ex.: https://trailup.vercel.app)
 *   PESQUISA_PLANILHA_ID       preenchida por criarPlanilhaDeInscricoes
 */

const PLANILHA_ABA_MODELOS = 'Modelos de e-mail';
const PLANILHA_DECISOES = ['Em análise', 'Aprovado', 'Recusado'];
const PLANILHA_CONTROLE = [
  'Decisão',
  'Situação',
  'Conta criada em',
  'Confirmação enviada em',
  'Confirmações enviadas',
  'E-mail confirmado em',
  'Acesso enviado em',
  'Observação da equipe',
];
// O link de confirmação expira (Auth → Email OTP Expiration). Sem confirmar, reenvia depois disto.
const PLANILHA_HORAS_PARA_REENVIAR = 24;
const PLANILHA_MAXIMO_DE_CONFIRMACOES = 3;
const PLANILHA_REMETENTE = 'Equipe TrailUp – pesquisa com professores';
// O PDF da cartilha vai anexo ao e-mail de acesso. Ele mora no R2, em `publico/` (o único prefixo
// que o gateway serve sem sessão), no mesmo projeto de PESQUISA_FUNCAO_URL; o mesmo arquivo é o
// "Baixar a cartilha em PDF" do site. Gerar: frontend/scripts/cartilha-pesquisa/gerar.mjs; subir:
// scripts/pesquisa-videos/subir-para-o-r2.mjs.
const PLANILHA_PDF_DA_CARTILHA = 'publico/pesquisa/cartilha-pesquisa-professores.pdf';
const PLANILHA_NOME_DO_ANEXO = 'Cartilha da pesquisa TrailUp.pdf';

const PLANILHA_MODELOS = [
  ['confirmacao', 'Confirme o seu e-mail para receber o acesso ao TrailUp',
    'Olá, {{primeiro_nome}}!\n\n'
    + 'Obrigada por se inscrever na avaliação do TrailUp. A sua inscrição foi aprovada e a sua conta já foi criada com este e-mail ({{email}}).\n\n'
    + 'Falta só confirmar que o endereço é seu. Clique no botão abaixo: o acesso de professor, o do aluno de teste e o link da avaliação chegam neste e-mail logo depois.\n\n'
    + '[[Confirmar meu e-mail|{{link_confirmacao}}]]\n\n'
    + 'O link vale por tempo limitado. Se ele expirar, mandamos outro em até um dia.\n\n'
    + 'Se não foi você quem se inscreveu, ignore esta mensagem: sem a confirmação, nenhum acesso é enviado.\n\n'
    + 'Equipe TrailUp'],
  ['acesso', 'Seu acesso para avaliar o TrailUp',
    'Olá, {{primeiro_nome}}!\n\n'
    + 'E-mail confirmado. Aqui estão os seus acessos para a avaliação:\n\n'
    + 'Console do professor\nLogin: {{email}}\nSenha: {{senha_professor}}\nTurma: {{turma}}\n\n'
    + '[[Entrar no console|{{link_login}}]]\n\n'
    + 'Aluno de teste (no app TrailUp)\nLogin: {{aluno_email}}\nSenha: {{senha_aluno}}\n'
    + 'No primeiro acesso, o app pede o cadastro do aluno (nome, data de nascimento e o questionário de perfil). Ao terminar, ele já entra na sua turma de demonstração.\n'
    + 'Baixar o app: {{link_app}}\n\n'
    + 'O formulário da avaliação fica na aba "Avaliar o TrailUp" do console ({{link_aba_avaliacao}}) e também neste link:\n\n'
    + '[[Abrir o formulário de avaliação|{{link_avaliacao}}]]\n\n'
    + 'A cartilha, com o roteiro das tarefas e os vídeos de apresentação: {{link_cartilha}}\n\n'
    + 'As senhas foram geradas aleatoriamente e só existem neste e-mail. Não as repasse; se quiser, troque a do professor em Meus dados. Os acessos são apagados ao fim da pesquisa.\n\n'
    + 'Equipe TrailUp'],
];

const PLANILHA_TEMA = {
  fundo: '#170f24',
  cartao: '#23192e',
  borda: '#493a5a',
  texto: '#f9f4fb',
  textoSuave: '#c3b7cd',
  primaria: '#ba93e1',
  destaque: '#95dfc9',
  destaqueTexto: '#0e251f',
  logo: 'https://trailup.vercel.app/trailup-estrela.png',
};
const PLANILHA_FONTE_TEXTO = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PLANILHA_FONTE_TITULO = "Cinzel, Georgia, 'Times New Roman', serif";

// ---------------------------------------------------------------------------------------------
// Montagem (uma vez)
// ---------------------------------------------------------------------------------------------

/**
 * Cria a planilha, liga o formulário de inscrição a ela e acrescenta as colunas de controle e a
 * aba de modelos. Rodar uma vez, depois de preencher PESQUISA_FORM_INSCRICAO_ID.
 */
function criarPlanilhaDeInscricoes() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PESQUISA_PLANILHA_ID')) {
    throw new Error('A planilha já existe (PESQUISA_PLANILHA_ID). Apague a propriedade para criar outra.');
  }
  const form = FormApp.openById(propriedadeObrigatoria_('PESQUISA_FORM_INSCRICAO_ID'));
  const planilha = SpreadsheetApp.create('TrailUp – inscrições da pesquisa com professores');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, planilha.getId());
  SpreadsheetApp.flush();
  Utilities.sleep(3000);

  const respostas = abaDeRespostas_(SpreadsheetApp.openById(planilha.getId()));
  garantirColunasDeControle_(respostas);
  garantirAbaDeModelos_(SpreadsheetApp.openById(planilha.getId()));
  const padrao = planilha.getSheetByName('Página1') || planilha.getSheetByName('Sheet1');
  if (padrao && planilha.getSheets().length > 1) planilha.deleteSheet(padrao);

  props.setProperty('PESQUISA_PLANILHA_ID', planilha.getId());
  Logger.log('Planilha: ' + planilha.getUrl());
  Logger.log('Marque "Aprovado" na coluna Decisão e rode processarAprovados (ou instalarProcessamentoAutomatico).');
}

/** Roda processarAprovados a cada 15 minutos: quem confirmar o e-mail recebe o acesso sozinho. */
function instalarProcessamentoAutomatico() {
  removerProcessamentoAutomatico();
  ScriptApp.newTrigger('processarAprovados').timeBased().everyMinutes(15).create();
  Logger.log('processarAprovados vai rodar a cada 15 minutos.');
}

function removerProcessamentoAutomatico() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'processarAprovados'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Manda para a própria conta os dois modelos preenchidos com dados de exemplo (nenhuma conta é criada). */
function enviarModelosDeTeste() {
  const planilha = SpreadsheetApp.openById(propriedadeObrigatoria_('PESQUISA_PLANILHA_ID'));
  const modelos = lerModelos_(planilha);
  const eu = Session.getEffectiveUser().getEmail();
  const campos = camposDoEmail_({ nome: 'Ana Clara Souza', email: 'ana@exemplo.com' }, {
    link_confirmacao: 'https://exemplo.com/confirmar',
    senha_professor: 'Exemplo-NaoUsar1',
    aluno_email: 'aluno.teste.00000000@trailup.app',
    senha_aluno: 'Exemplo-NaoUsar2',
    turma: 'Turma de demonstração – Ana Clara Souza',
  });
  const pdf = pdfDaCartilha_();
  ['confirmacao', 'acesso'].forEach(function (chave) {
    const anexos = chave === 'acesso' && pdf ? [pdf] : [];
    enviar_(eu, '[teste] ' + preencher_(modelos[chave].assunto, campos), preencher_(modelos[chave].texto, campos), anexos);
  });
  Logger.log('Dois e-mails de teste enviados para a sua própria conta' + (pdf ? ', o de acesso com a cartilha em PDF.' : '. A cartilha em PDF não foi anexada: veja o log acima.'));
}

// ---------------------------------------------------------------------------------------------
// Confirmação para o site
// ---------------------------------------------------------------------------------------------

// Formato de crypto.randomUUID(), que é o que a página gera para cada envio.
const CODIGO_DO_SITE_FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * A página de inscrição do site manda as respostas direto ao Forms, sem conseguir ler a resposta
 * do Google, com um código aleatório no campo CAMPO_CODIGO_DO_SITE. Depois pergunta aqui se esse
 * código chegou. Publicado como App da Web (executar como: eu; acesso: qualquer pessoa).
 *
 * Responde só {"recebida": true|false}. Nenhum dado da resposta nem da planilha sai daqui, e a
 * planilha continua privada. Sem o código, que só o navegador de quem enviou conhece, não há o que
 * perguntar: um e-mail no lugar dele diria a qualquer um quem se inscreveu.
 */
function doGet(e) {
  const codigo = String((e && e.parameter && e.parameter.codigo) || '').toLowerCase();
  const recebida = CODIGO_DO_SITE_FORMATO.test(codigo) && inscricaoComCodigo_(codigo);
  return ContentService.createTextOutput(JSON.stringify({ recebida: recebida }))
    .setMimeType(ContentService.MimeType.JSON);
}

function inscricaoComCodigo_(codigo) {
  const form = FormApp.openById(propriedadeObrigatoria_('PESQUISA_FORM_INSCRICAO_ID'));
  const item = itemDoCodigoDoSite_(form);
  if (!item) return false;
  return form.getResponses().some(function (r) {
    const resposta = r.getResponseForItem(item);
    return resposta !== null && String(resposta.getResponse()).trim().toLowerCase() === codigo;
  });
}

function itemDoCodigoDoSite_(form) {
  return form.getItems(FormApp.ItemType.TEXT)
    .filter(function (i) { return i.getTitle() === CAMPO_CODIGO_DO_SITE; })[0] || null;
}

/**
 * Acrescenta o campo do código ao formulário de inscrição que já existe (os novos já nascem com
 * ele) e mostra o entry.* que a página do site usa. Pode rodar de novo: não duplica.
 */
function acrescentarCodigoDoSite() {
  const form = FormApp.openById(propriedadeObrigatoria_('PESQUISA_FORM_INSCRICAO_ID'));
  if (!itemDoCodigoDoSite_(form)) {
    form.addTextItem().setTitle(CAMPO_CODIGO_DO_SITE).setHelpText(AJUDA_CODIGO_DO_SITE);
  }
  const item = itemDoCodigoDoSite_(form).asTextItem();
  const preenchido = form.createResponse().withItemResponse(item.createResponse('x')).toPrefilledUrl();
  Logger.log('Campo do código: ' + (preenchido.match(/entry\.\d+/) || ['(não achei o entry)'])[0]);
}

// ---------------------------------------------------------------------------------------------
// Processamento
// ---------------------------------------------------------------------------------------------

/**
 * Leva cada linha com Decisão = "Aprovado" ao próximo passo. Pode rodar quantas vezes quiser:
 * cada passo só acontece se a data dele estiver vazia.
 */
function processarAprovados() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) {
    Logger.log('Outra execução está rodando; esta sai sem fazer nada.');
    return;
  }
  try {
    const planilha = SpreadsheetApp.openById(propriedadeObrigatoria_('PESQUISA_PLANILHA_ID'));
    const aba = abaDeRespostas_(planilha);
    const col = garantirColunasDeControle_(aba);
    const modelos = lerModelos_(planilha);
    const ultima = aba.getLastRow();
    if (ultima < 2) return;
    const linhas = aba.getRange(2, 1, ultima - 1, aba.getLastColumn()).getValues();

    const aprovados = [];
    linhas.forEach(function (valores, i) {
      if (String(valores[col['Decisão']]).trim() !== 'Aprovado') return;
      const email = String(valores[col.email]).trim().toLowerCase();
      if (!email) return;
      aprovados.push({
        linha: i + 2,
        email: email,
        nome: String(valores[col.nome]).trim(),
        instituicao: col.instituicao === undefined ? '' : String(valores[col.instituicao]).trim(),
        v: valores,
      });
    });
    if (!aprovados.length) {
      Logger.log('Nenhuma linha com Decisão = Aprovado.');
      return;
    }

    const marcar = function (a, coluna, valor) {
      aba.getRange(a.linha, col[coluna] + 1).setValue(valor);
      a.v[col[coluna]] = valor;
    };
    const situacao = function (a, texto) { marcar(a, 'Situação', texto); };
    const vazio = function (a, coluna) { return a.v[col[coluna]] === '' || a.v[col[coluna]] === null; };

    // 1. Conta
    aprovados.filter(function (a) { return vazio(a, 'Conta criada em'); }).forEach(function (a) {
      // Conta que já existia no TrailUp: a equipe resolve à mão; não insiste a cada 15 minutos.
      if (String(a.v[col['Situação']]).indexOf('Erro: este e-mail já tem conta') === 0) return;
      if (!a.nome) return situacao(a, 'Erro: falta o nome na inscrição.');
      const r = chamarFuncao_({ acao: 'criar', email: a.email, nome: a.nome, instituicao: a.instituicao });
      if (!r.ok) {
        return situacao(a, r.erro === 'email_ja_tem_conta'
          ? 'Erro: este e-mail já tem conta no TrailUp. Resolver à mão (conta existente) antes de seguir.'
          : 'Erro ao criar a conta: ' + r.erro);
      }
      marcar(a, 'Conta criada em', new Date());
      situacao(a, '✓ Conta criada' + (r.corpo.classe_id ? ' (turma de demonstração nº ' + r.corpo.classe_id + ')' : ''));
    });

    // 2. Confirmação do e-mail (envio e reenvio)
    aprovados.filter(function (a) { return !vazio(a, 'Conta criada em') && vazio(a, 'E-mail confirmado em'); })
      .forEach(function (a) {
        const enviadas = Number(a.v[col['Confirmações enviadas']]) || 0;
        const ultimaVez = a.v[col['Confirmação enviada em']];
        const venceu = ultimaVez instanceof Date
          && (Date.now() - ultimaVez.getTime()) > PLANILHA_HORAS_PARA_REENVIAR * 3600 * 1000;
        if (!vazio(a, 'Confirmação enviada em') && !(venceu && enviadas < PLANILHA_MAXIMO_DE_CONFIRMACOES)) return;
        const r = chamarFuncao_({ acao: 'confirmacao', email: a.email });
        if (!r.ok) return situacao(a, 'Erro ao gerar o link de confirmação: ' + r.erro);
        if (r.corpo.ja_confirmado) return; // o passo 3 registra
        const campos = camposDoEmail_(a, { link_confirmacao: r.corpo.link });
        const erro = enviarModelo_(modelos, 'confirmacao', a.email, campos);
        if (erro) return situacao(a, 'Erro ao enviar a confirmação: ' + erro);
        marcar(a, 'Confirmação enviada em', new Date());
        marcar(a, 'Confirmações enviadas', enviadas + 1);
        situacao(a, '✓ Confirmação enviada' + (enviadas ? ' de novo (' + (enviadas + 1) + 'ª)' : '') + '; aguardando o clique');
      });

    // 3. Quem confirmou
    const aguardando = aprovados.filter(function (a) {
      return !vazio(a, 'Confirmação enviada em') && vazio(a, 'E-mail confirmado em');
    });
    if (aguardando.length) {
      const r = chamarFuncao_({ acao: 'situacao', emails: aguardando.map(function (a) { return a.email; }) });
      if (r.ok) {
        (r.corpo.avaliadores || []).forEach(function (s) {
          if (!s.confirmado) return;
          aguardando.filter(function (a) { return a.email === s.email; }).forEach(function (a) {
            marcar(a, 'E-mail confirmado em', s.confirmado_em ? new Date(s.confirmado_em) : new Date());
            situacao(a, '✓ E-mail confirmado');
          });
        });
      } else {
        Logger.log('Não deu para consultar as confirmações: ' + r.erro);
      }
    }

    // 4. Acesso
    aprovados.filter(function (a) { return !vazio(a, 'E-mail confirmado em') && vazio(a, 'Acesso enviado em'); })
      .forEach(function (a) {
        if (MailApp.getRemainingDailyQuota() < 1) return situacao(a, 'Aguardando: cota diária de e-mails esgotada.');
        const r = chamarFuncao_({ acao: 'acesso', email: a.email });
        if (!r.ok) return situacao(a, 'Erro ao gerar o acesso: ' + r.erro);
        const campos = camposDoEmail_(a, {
          senha_professor: r.corpo.senha_professor,
          aluno_email: r.corpo.aluno_email,
          senha_aluno: r.corpo.senha_aluno,
          turma: r.corpo.turma || 'Turma de demonstração',
        });
        const pdf = pdfDaCartilha_();
        const erro = enviarModelo_(modelos, 'acesso', a.email, campos, pdf ? [pdf] : []);
        // Se o e-mail não saiu, a próxima rodada gera senhas novas: as de agora não ficam em lugar nenhum.
        if (erro) return situacao(a, 'Erro ao enviar o acesso (tenta de novo na próxima rodada): ' + erro);
        chamarFuncao_({ acao: 'acesso_enviado', email: a.email });
        marcar(a, 'Acesso enviado em', new Date());
        situacao(a, '✓ Acesso enviado');
      });
  } finally {
    trava.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------------------------

function propriedadeObrigatoria_(nome) {
  const valor = PropertiesService.getScriptProperties().getProperty(nome);
  if (!valor) throw new Error('Preencha a propriedade do script ' + nome + '.');
  return valor;
}

function abaDeRespostas_(planilha) {
  const aba = planilha.getSheets().filter(function (s) { return Boolean(s.getFormUrl()); })[0];
  if (!aba) throw new Error('A planilha não tem a aba de respostas do formulário.');
  return aba;
}

/** Acrescenta as colunas que faltam e devolve o índice (base 0) de cada uma, mais nome/e-mail/instituição. */
function garantirColunasDeControle_(aba) {
  let cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
  PLANILHA_CONTROLE.forEach(function (titulo) {
    if (cabecalho.indexOf(titulo) >= 0) return;
    const coluna = cabecalho.length + 1;
    aba.getRange(1, coluna).setValue(titulo).setFontWeight('bold');
    cabecalho.push(titulo);
    if (titulo === 'Decisão') {
      const regra = SpreadsheetApp.newDataValidation().requireValueInList(PLANILHA_DECISOES, true).build();
      aba.getRange(2, coluna, aba.getMaxRows() - 1, 1).setDataValidation(regra);
    }
  });
  const col = {};
  cabecalho.forEach(function (titulo, i) { col[titulo] = i; });
  col.nome = cabecalho.findIndex(function (t) { return t.indexOf('Nome completo') === 0; });
  col.email = cabecalho.findIndex(function (t) { return t.indexOf('E-mail') === 0; });
  const inst = cabecalho.findIndex(function (t) { return t.indexOf('Instituição') === 0; });
  col.instituicao = inst >= 0 ? inst : undefined;
  if (col.nome < 0 || col.email < 0) throw new Error('Não achei as colunas "Nome completo" e "E-mail" da inscrição.');
  return col;
}

function garantirAbaDeModelos_(planilha) {
  let aba = planilha.getSheetByName(PLANILHA_ABA_MODELOS);
  if (aba) return aba;
  aba = planilha.insertSheet(PLANILHA_ABA_MODELOS);
  aba.getRange(1, 1, 1, 3).setValues([['Modelo', 'Assunto', 'Texto']]).setFontWeight('bold');
  aba.getRange(2, 1, PLANILHA_MODELOS.length, 3).setValues(PLANILHA_MODELOS).setWrap(true).setVerticalAlignment('top');
  aba.setColumnWidth(2, 320);
  aba.setColumnWidth(3, 640);
  aba.getRange(PLANILHA_MODELOS.length + 3, 1).setValue(
    'Campos: {{nome}} {{primeiro_nome}} {{email}} {{link_confirmacao}} {{senha_professor}} {{aluno_email}} '
    + '{{senha_aluno}} {{turma}} {{link_login}} {{link_app}} {{link_avaliacao}} {{link_aba_avaliacao}} {{link_cartilha}}. '
    + 'Uma linha só com [[Texto|{{link_...}}]] vira botão. Não mude a coluna Modelo.');
  return aba;
}

function lerModelos_(planilha) {
  const aba = garantirAbaDeModelos_(planilha);
  const modelos = {};
  aba.getRange(2, 1, Math.max(aba.getLastRow() - 1, 1), 3).getValues().forEach(function (l) {
    if (l[0]) modelos[String(l[0]).trim()] = { assunto: String(l[1]), texto: String(l[2]) };
  });
  PLANILHA_MODELOS.forEach(function (m) {
    if (!modelos[m[0]]) modelos[m[0]] = { assunto: m[1], texto: m[2] };
  });
  return modelos;
}

function camposDoEmail_(avaliador, extras) {
  const props = PropertiesService.getScriptProperties();
  const site = String(props.getProperty('PESQUISA_SITE_URL') || '').replace(/\/+$/, '');
  const campos = {
    nome: avaliador.nome,
    primeiro_nome: String(avaliador.nome).split(/\s+/)[0] || avaliador.nome,
    email: avaliador.email,
    link_login: site + '/login',
    link_app: site + '/download',
    link_cartilha: site + '/pesquisa/professores',
    link_aba_avaliacao: site + '/console/avaliar',
    link_avaliacao: props.getProperty('PESQUISA_LINK_AVALIACAO') || site + '/console/avaliar',
  };
  Object.keys(extras || {}).forEach(function (k) { campos[k] = extras[k]; });
  return campos;
}

function preencher_(modelo, campos) {
  return String(modelo).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (inteiro, chave) {
    return Object.prototype.hasOwnProperty.call(campos, chave) ? String(campos[chave]) : inteiro;
  });
}

function enviarModelo_(modelos, chave, para, campos, anexos) {
  try {
    const modelo = modelos[chave];
    const assunto = preencher_(modelo.assunto, campos);
    const texto = preencher_(modelo.texto, campos);
    if (/\{\{[a-z_]+\}\}/.test(assunto + texto)) {
      return 'o modelo "' + chave + '" tem campo que não existe: ' + (assunto + texto).match(/\{\{[a-z_]+\}\}/)[0];
    }
    enviar_(para, assunto, texto, anexos);
    return null;
  } catch (e) {
    return String(e && e.message || e);
  }
}

function enviar_(para, assunto, texto, anexos) {
  const mensagem = {
    to: para,
    subject: assunto,
    body: texto.replace(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/gm, '$1: $2'),
    htmlBody: htmlDoEmail_(assunto, texto),
    name: PLANILHA_REMETENTE,
  };
  if (anexos && anexos.length) mensagem.attachments = anexos;
  MailApp.sendEmail(mensagem);
}

// Baixado uma vez por execução: a mesma rodada pode mandar o acesso a vários aprovados.
let pdfDaCartilhaDestaExecucao_;

/**
 * O PDF da cartilha, para anexar, ou null. Sem ele o acesso sai mesmo assim, com o link da
 * cartilha no texto: o anexo é conveniência, e segurar as senhas por causa dele seria pior.
 */
function pdfDaCartilha_() {
  if (pdfDaCartilhaDestaExecucao_ !== undefined) return pdfDaCartilhaDestaExecucao_;
  pdfDaCartilhaDestaExecucao_ = null;
  try {
    const projeto = /^https:\/\/[^/]+/.exec(propriedadeObrigatoria_('PESQUISA_FUNCAO_URL'));
    if (!projeto) throw new Error('PESQUISA_FUNCAO_URL não é https');
    const resposta = UrlFetchApp.fetch(
      projeto[0] + '/functions/v1/storage-redirect?path=' + encodeURIComponent(PLANILHA_PDF_DA_CARTILHA),
      { followRedirects: true, muteHttpExceptions: true },
    );
    const bytes = resposta.getContent();
    // Confere que veio um PDF, e não uma página de erro com status 200.
    const ehPdf = bytes.length > 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === '%PDF';
    if (resposta.getResponseCode() !== 200 || !ehPdf) {
      Logger.log('Cartilha em PDF indisponível (HTTP ' + resposta.getResponseCode() + '): o acesso sai sem o anexo.');
      return null;
    }
    pdfDaCartilhaDestaExecucao_ = resposta.getBlob().setContentType('application/pdf').setName(PLANILHA_NOME_DO_ANEXO);
  } catch (e) {
    Logger.log('Cartilha em PDF indisponível (' + (e && e.message || e) + '): o acesso sai sem o anexo.');
  }
  return pdfDaCartilhaDestaExecucao_;
}

/** Chama a edge function. Nunca registra o corpo da resposta: ele pode trazer senha. */
function chamarFuncao_(pedido) {
  const resposta = UrlFetchApp.fetch(propriedadeObrigatoria_('PESQUISA_FUNCAO_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-pesquisa-segredo': propriedadeObrigatoria_('PESQUISA_FUNCAO_SEGREDO') },
    payload: JSON.stringify(pedido),
    muteHttpExceptions: true,
  });
  let corpo = {};
  try {
    corpo = JSON.parse(resposta.getContentText() || '{}');
  } catch (e) {
    corpo = {};
  }
  const status = resposta.getResponseCode();
  if (status >= 200 && status < 300 && corpo.ok) return { ok: true, corpo: corpo };
  return { ok: false, erro: corpo.error || ('HTTP ' + status) };
}

// ---------------------------------------------------------------------------------------------
// HTML no tema do TrailUp (o mesmo de scripts/apps-script-email)
// ---------------------------------------------------------------------------------------------

function htmlDoEmail_(assunto, texto) {
  const T = PLANILHA_TEMA;
  const miolo = texto.split(/\n{2,}/).map(function (bloco) {
    const botao = bloco.trim().match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
    if (botao) {
      return '<p style="margin:8px 0 24px;"><a href="' + escaparHtml_(botao[2].trim()) + '" style="display:inline-block;'
        + 'padding:12px 22px;border-radius:999px;background:' + T.destaque + ';color:' + T.destaqueTexto + ';'
        + 'font-weight:700;text-decoration:none;">' + escaparHtml_(botao[1].trim()) + '</a></p>';
    }
    return '<p style="margin:0 0 16px;">' + linkar_(escaparHtml_(bloco)).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  const fundo = function (cor) {
    return 'background-color:' + cor + ';background-image:linear-gradient(' + cor + ',' + cor + ');';
  };
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
    + '<title>' + escaparHtml_(assunto) + '</title></head>'
    + '<body style="margin:0;padding:0;' + fundo(T.fundo) + '">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + fundo(T.fundo) + '">'
    + '<tr><td align="center" style="padding:32px 16px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">'
    + '<tr><td align="center" style="padding:0 0 20px;">'
    + '<img src="' + T.logo + '" width="64" height="64" alt="TrailUp" style="display:block;border:0;margin:0 auto 10px;">'
    + '<div style="font-family:' + PLANILHA_FONTE_TITULO + ';font-size:22px;letter-spacing:2px;color:' + T.texto + ';">TrailUp</div>'
    + '</td></tr>'
    + '<tr><td style="' + fundo(T.cartao) + 'border:1px solid ' + T.borda + ';border-radius:12px;">'
    + '<div style="height:4px;line-height:4px;font-size:0;border-radius:12px 12px 0 0;background:' + T.primaria
    + ';background-image:linear-gradient(90deg,' + T.primaria + ',' + T.destaque + ');">&nbsp;</div>'
    + '<div style="padding:28px 28px 8px;">'
    + '<h1 style="margin:0 0 20px;font-family:' + PLANILHA_FONTE_TITULO + ';font-size:20px;line-height:1.35;color:' + T.primaria + ';">'
    + escaparHtml_(assunto) + '</h1>'
    + '<div style="font-family:' + PLANILHA_FONTE_TEXTO + ';font-size:15px;line-height:1.6;color:' + T.texto + ';">' + miolo + '</div>'
    + '</div></td></tr>'
    + '<tr><td align="center" style="padding:20px 8px 0;font-family:' + PLANILHA_FONTE_TEXTO + ';font-size:12px;color:' + T.textoSuave + ';">'
    + 'Pesquisa de avaliação do TrailUp com professores.</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function linkar_(html) {
  return html.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + PLANILHA_TEMA.primaria + ';">$1</a>');
}

function escaparHtml_(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
