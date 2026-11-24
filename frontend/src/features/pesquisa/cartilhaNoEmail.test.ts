import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { MARCADORES_DA_CARTILHA, arquivoGsDaCartilha } from "./cartilhaNoEmail";
import { EVITE, FACA, PASSOS, PERGUNTAS_FREQUENTES, TAREFAS } from "./pesquisaProfessores";

const pasta = (arquivo: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../scripts/apps-script-formulario-professores/${arquivo}`, import.meta.url)), "utf-8");

const CARTILHA_GS = pasta("CartilhaNoEmail.gs");
const PLANILHA_GS = pasta("Planilha.gs");

type Enviado = { to: string; subject: string; body: string; htmlBody: string; attachments?: unknown };

/** Roda o Apps Script de verdade (os dois .gs) com o MailApp trocado por um gravador. */
function rodarAppsScript() {
  const enviados: Enviado[] = [];
  const contexto = { MailApp: { sendEmail: (m: Enviado) => enviados.push(m) } };
  const api = runInNewContext(
    `${CARTILHA_GS}\n${PLANILHA_GS}\n({ enviar_, cartilhaNoEmail_, htmlDoEmail_ })`,
    contexto,
  ) as {
    enviar_: (para: string, assunto: string, texto: string, cartilha: { html: string; texto: string } | null) => void;
    cartilhaNoEmail_: (campos: Record<string, string>) => { html: string; texto: string };
  };
  return { api, enviados };
}

const ACESSO = "Olá, Ana!\n\nE-mail confirmado.\n\n[[Entrar no console|https://trailup.vercel.app/login]]\n\nEquipe TrailUp";
const LINK = "https://trailup.vercel.app/pesquisa/professores";

describe("cartilha no corpo do e-mail de acesso", () => {
  it("o CartilhaNoEmail.gs está em dia com a cartilha (rode scripts/cartilha-pesquisa/gerar-email.mjs)", () => {
    expect(CARTILHA_GS).toBe(arquivoGsDaCartilha());
  });

  it("o e-mail de acesso leva a cartilha em HTML e em texto, sem anexo e sem marcador sobrando", () => {
    const { api, enviados } = rodarAppsScript();
    api.enviar_("ana@exemplo.com", "Seu acesso", ACESSO, api.cartilhaNoEmail_({ link_cartilha: LINK }));
    const [email] = enviados;
    expect(email.attachments).toBeUndefined();
    expect(email.htmlBody).not.toMatch(/@@\w+@@/);
    expect(email.body).not.toMatch(/@@\w+@@/);
    expect(email.htmlBody).toContain(`href="${LINK}"`);
    for (const tarefa of TAREFAS) {
      expect(email.htmlBody).toContain(tarefa.titulo);
      expect(email.body).toContain(tarefa.titulo);
    }
    for (const texto of [...PASSOS.map(p => p.titulo), ...FACA.slice(0, 1), ...EVITE.slice(0, 1), PERGUNTAS_FREQUENTES[0].pergunta]) {
      expect(email.body).toContain(texto);
    }
    // A cartilha vem depois da mensagem, não antes: os acessos são o que a pessoa procura primeiro.
    expect(email.htmlBody.indexOf("Entrar no console")).toBeLessThan(email.htmlBody.indexOf("Cartilha do professor"));
  });

  it("cabe antes do corte do Gmail (102 KB de HTML)", () => {
    const { api, enviados } = rodarAppsScript();
    api.enviar_("ana@exemplo.com", "Seu acesso", ACESSO, api.cartilhaNoEmail_({ link_cartilha: LINK }));
    expect(Buffer.byteLength(enviados[0].htmlBody)).toBeLessThan(95 * 1024);
  });

  it("o e-mail de confirmação continua sem a cartilha", () => {
    const { api, enviados } = rodarAppsScript();
    api.enviar_("ana@exemplo.com", "Confirme", "Olá!", null);
    expect(enviados[0].htmlBody).not.toContain("Cartilha do professor");
  });

  it("o Apps Script conhece todos os marcadores, e o link é escapado", () => {
    const { api } = rodarAppsScript();
    const { html } = api.cartilhaNoEmail_({ link_cartilha: 'https://x.y/"><script>' });
    expect(html).not.toContain("<script>");
    expect(MARCADORES_DA_CARTILHA.length).toBeGreaterThan(0);
  });

  it("acabou o anexo e a função de teste do Apps Script: o teste é o fluxo real pelo site", () => {
    expect(PLANILHA_GS).not.toMatch(/attachments|pdfDaCartilha_|function enviarModelosDeTeste/);
  });
});
