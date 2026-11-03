/**
 * Envio de e-mail do TrailUp (substitui a Brevo).
 *
 * Quem chama é o BANCO, não a API: `fn_enviar_contato`,
 * `fn_enviar_contato_publico` e `retencao_avisos_email` fazem `net.http_post`
 * para a URL deste app da web, lida do Vault (`apps_script_email_url`), com o
 * segredo também do Vault (`apps_script_email_segredo`) no corpo.
 *
 * O e-mail sai da conta Google que publicou o script, com `MailApp`. A cota é
 * a dessa conta (conta Gmail comum: ~100 destinatários por dia).
 *
 * Qualquer falha LEVANTA erro em vez de devolver `{ok: false}`. É de propósito:
 * o app da web responde 200 tanto ao envio que deu certo (depois do
 * redirecionamento, que o pg_net segue) quanto ao `doPost` que levantou (página
 * de erro). O banco só conta como enviado o corpo com `"ok": true`, e um
 * `{ok: false}` com 200 seria fácil de confundir. Ver `README.md`.
 */

var PROPRIEDADE_SEGREDO = 'TRAILUP_SEGREDO';
var EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Tema do TrailUp: os tokens de `frontend/src/index.css` em hex (e-mail não
// entende `hsl(var(...))`). Mudou lá, muda aqui.
var TEMA = {
  fundo: '#170f24',       // --background
  cartao: '#23192e',      // --card
  borda: '#493a5a',       // --border
  texto: '#f9f4fb',       // --foreground
  textoSuave: '#c3b7cd',  // --muted-foreground
  primaria: '#ba93e1',    // --primary
  destaque: '#95dfc9',    // --accent
  destaqueTexto: '#0e251f', // --accent-foreground
  logo: 'https://trailup.vercel.app/trailup-app-icon.png' // a estrela (ícone do app)
};
var FONTE_TEXTO = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
var FONTE_TITULO = "Cinzel, Georgia, 'Times New Roman', serif";

function doPost(e) {
  var pedido = lerPedido_(e);
  conferirSegredo_(pedido.segredo);

  var para = exigirEmail_(pedido.para, 'para');
  var assunto = exigirTexto_(pedido.assunto, 'assunto', 250);
  var texto = exigirTexto_(pedido.texto, 'texto', 20000);

  var opcoes = {
    name: limitar_(pedido.nome_remetente || 'TrailUp', 80),
    htmlBody: montarHtml_(assunto, texto, pedido.html ? limitar_(pedido.html, 50000) : null)
  };
  if (pedido.responder_para) {
    opcoes.replyTo = exigirEmail_(pedido.responder_para, 'responder_para');
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('cota diaria do MailApp esgotada');
  }
  MailApp.sendEmail(para, assunto, texto, opcoes);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, cota_restante: MailApp.getRemainingDailyQuota() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Rode UMA vez pelo editor (Executar → gerarSegredo). Cria o segredo se ainda
 * não existir e mostra no registro de execução, para copiar para o Vault do
 * Supabase como `apps_script_email_segredo`. Rodar de novo não troca o segredo.
 */
function gerarSegredo() {
  var props = PropertiesService.getScriptProperties();
  var segredo = props.getProperty(PROPRIEDADE_SEGREDO);
  if (!segredo) {
    segredo = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty(PROPRIEDADE_SEGREDO, segredo);
  }
  Logger.log('apps_script_email_segredo = ' + segredo);
}

function lerPedido_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('corpo vazio');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (erro) {
    throw new Error('corpo nao e JSON');
  }
}

function conferirSegredo_(recebido) {
  var esperado = PropertiesService.getScriptProperties().getProperty(PROPRIEDADE_SEGREDO);
  if (!esperado) {
    throw new Error('segredo nao configurado no script');
  }
  if (typeof recebido !== 'string' || recebido !== esperado) {
    throw new Error('segredo invalido');
  }
}

function exigirEmail_(valor, campo) {
  var email = typeof valor === 'string' ? valor.trim() : '';
  if (email.length > 254 || !EMAIL_VALIDO.test(email)) {
    throw new Error(campo + ' invalido');
  }
  return email;
}

function exigirTexto_(valor, campo, maximo) {
  var texto = typeof valor === 'string' ? valor.trim() : '';
  if (!texto) {
    throw new Error(campo + ' vazio');
  }
  return limitar_(texto, maximo);
}

function limitar_(valor, maximo) {
  return String(valor).slice(0, maximo);
}

/**
 * Embrulha a mensagem no tema do TrailUp. Com `html` (o aviso de conta
 * inativa), usa o miolo que o banco mandou e só aplica o estilo nas tags; sem
 * ele (os contatos), monta o miolo do texto, escapado. Tudo com estilo inline e
 * tabela: cliente de e-mail ignora boa parte do CSS.
 *
 * O Gmail do iPhone e do Android, com o aparelho em modo escuro, INVERTE as
 * cores de todo e-mail e ignora `color-scheme: dark`: o fundo roxo-escuro
 * chegava lilás-claro e o texto claro, preto (03/11). Dois remédios, que só
 * valem lá (o seletor `u + .body` só casa com o HTML que o Gmail reescreve):
 * - fundo também como `background-image` (`fundo_`): o Gmail não inverte imagem;
 * - texto dentro de `.gs` > `.gd` (`texto_`): `screen` e `difference` sobre
 *   preto desfazem a inversão da cor do texto.
 */
function montarHtml_(assunto, texto, html) {
  var miolo = html ? estilizarMiolo_(html) : textoParaHtml_(texto);
  var previa = escapar_(texto.replace(/\s+/g, ' ').slice(0, 120));
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
    + '<style>'
    + 'u + .body .gs{background:#000;mix-blend-mode:screen;}'
    + 'u + .body .gd{background:#000;mix-blend-mode:difference;}'
    + '</style>'
    + '<title>' + escapar_(assunto) + '</title></head>'
    + '<body class="body" style="margin:0;padding:0;' + fundo_(TEMA.fundo) + '">'
    + '<u></u>'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + previa + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + fundo_(TEMA.fundo) + '">'
    + '<tr><td align="center" style="padding:32px 16px;' + fundo_(TEMA.fundo) + '">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">'
    // Cabeçalho: logo + nome.
    + '<tr><td align="center" style="padding:0 0 20px;">'
    + '<img src="' + TEMA.logo + '" width="64" height="64" alt="TrailUp" style="display:block;border:0;margin:0 auto 10px;">'
    + texto_('<div style="font-family:' + FONTE_TITULO + ';font-size:22px;letter-spacing:2px;color:' + TEMA.texto + ';">TrailUp</div>')
    + '</td></tr>'
    // Cartão.
    + '<tr><td style="' + fundo_(TEMA.cartao) + 'border:1px solid ' + TEMA.borda + ';border-radius:12px;">'
    + '<div style="height:4px;line-height:4px;font-size:0;border-radius:12px 12px 0 0;'
    + 'background:' + TEMA.primaria + ';background-image:linear-gradient(90deg,' + TEMA.primaria + ',' + TEMA.destaque + ');">&nbsp;</div>'
    + '<div style="padding:28px 28px 8px;">'
    + texto_('<h1 style="margin:0 0 20px;font-family:' + FONTE_TITULO + ';font-size:20px;line-height:1.35;font-weight:700;color:' + TEMA.primaria + ';">'
      + escapar_(assunto) + '</h1>')
    + texto_('<div style="font-family:' + FONTE_TEXTO + ';font-size:15px;line-height:1.6;color:' + TEMA.texto + ';">' + miolo + '</div>')
    + '</div></td></tr>'
    // Rodapé.
    + '<tr><td align="center" style="padding:20px 8px 0;">'
    + texto_('<div style="font-family:' + FONTE_TEXTO + ';font-size:12px;line-height:1.5;color:' + TEMA.textoSuave + ';">'
      + 'Mensagem enviada pelo TrailUp.</div>')
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

// Fundo que o Gmail em modo escuro não inverte: a cor e a mesma cor como imagem.
function fundo_(cor) {
  return 'background-color:' + cor + ';background-image:linear-gradient(' + cor + ',' + cor + ');';
}

// Texto que o Gmail em modo escuro devolve à cor original (ver `montarHtml_`).
function texto_(html) {
  return '<div class="gs"><div class="gd">' + html + '</div></div>';
}

/**
 * Manda para a própria conta um e-mail de amostra, igual ao da exclusão de
 * conta. Rodar pelo editor (Executar → enviarTeste) depois de mexer no visual,
 * e abrir no Gmail do celular com o modo escuro ligado e desligado.
 */
function enviarTeste() {
  var texto = 'Nome: Ana Clara Souza\nEmail: ana@exemplo.com\n\nMensagem:\n'
    + 'Pedido de exclusão da conta (ana@exemplo.com). Motivo: Não informado.';
  var assunto = 'Solicitação de exclusão de conta';
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: '[teste] ' + assunto,
    body: texto,
    htmlBody: montarHtml_(assunto, texto, null),
    name: 'TrailUp Contato'
  });
}

function textoParaHtml_(texto) {
  return texto.split(/\n{2,}/).map(function (bloco) {
    return '<p style="margin:0 0 16px;">' + escapar_(bloco).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

// O miolo do aviso vem do banco com <p>, <strong> e um <a> (o botão de entrar).
function estilizarMiolo_(html) {
  return html
    .replace(/<p>/g, '<p style="margin:0 0 16px;">')
    .replace(/<strong>/g, '<strong style="color:' + TEMA.destaque + ';">')
    .replace(/<a /g, '<a style="display:inline-block;padding:12px 22px;border-radius:8px;'
      + 'background:' + TEMA.destaque + ';color:' + TEMA.destaqueTexto + ';font-weight:700;text-decoration:none;" ');
}

function escapar_(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
