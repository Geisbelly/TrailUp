import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  andamentoDaPagina,
  chaveDoRascunho,
  corpoDaAvaliacao,
  emailsInvalidos,
  lerRascunho,
  pedacosComLinks,
  urlDoEnvioDaAvaliacao,
  type FormularioDeAvaliacao,
  type ItemDaAvaliacao,
  type PaginaDaAvaliacao,
  type RespostasDaAvaliacao,
} from "@/features/pesquisa/formularioDeAvaliacao";
import { ESPERAS_DA_CONFERENCIA_MS, lerConfirmacao, urlDaConferencia } from "@/features/pesquisa/inscricaoNoSite";
import { marcarAvaliacaoEnviada } from "@/features/pesquisa/roteiroApi";

type Etapa = "respondendo" | "enviando" | "conferindo" | "recebida" | "enviada" | "sem-confirmacao" | "erro";

type Props = {
  formulario: FormularioDeAvaliacao;
  /** id de quem está logado: o rascunho é por pessoa. */
  usuario: string;
  /** E-mail do login, que é o mesmo da inscrição. Preenche a primeira pergunta. */
  email: string | null;
  /** App da Web que responde se o código chegou. Sem ele (ou sem o campo no formulário), não há conferência. */
  confirmacao: string | null;
  /** O mesmo formulário no Google, para quando algo der errado aqui. */
  linkDoGoogle: string;
};

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): o formulário funciona igual, só não guarda rascunho.
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function apagar(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {
    // idem
  }
}

async function codigoChegou(confirmacao: string, codigo: string): Promise<boolean> {
  try {
    const resposta = await fetch(`${urlDaConferencia(confirmacao, codigo)}&formulario=avaliacao`, { cache: "no-store" });
    return resposta.ok && lerConfirmacao(await resposta.json());
  } catch {
    return false;
  }
}

function TextoComLinks({ texto, className }: { texto: string; className?: string }) {
  if (!texto) return null;
  return (
    <div className={className}>
      {texto.split(/\n{2,}/).map((paragrafo, i) => (
        <p key={i} className="whitespace-pre-line">
          {pedacosComLinks(paragrafo).map((p, j) =>
            p.link ? (
              <a key={j} href={p.texto} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
                {p.texto}
              </a>
            ) : (
              <span key={j}>{p.texto}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

const opcaoBase =
  "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const marcada = "border-primary bg-primary/15 font-semibold text-foreground";
const livre = "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground";

/** Opções de escolha única como botões. Nada é obrigatório, então clicar de novo desmarca. */
function EscolhaUnica({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  colunas,
  larguraDoItem = "",
}: {
  rotulo: string;
  opcoes: readonly string[];
  valor: string;
  aoMudar: (valor: string) => void;
  colunas: string;
  larguraDoItem?: string;
}) {
  return (
    <RadioGroupPrimitive.Root aria-label={rotulo} value={valor} onValueChange={aoMudar} className={`gap-2 ${colunas}`}>
      {opcoes.map(opcao => (
        <RadioGroupPrimitive.Item
          key={opcao}
          value={opcao}
          onClick={() => valor === opcao && aoMudar("")}
          className={`${opcaoBase} ${larguraDoItem} ${valor === opcao ? marcada : livre}`}
        >
          {opcao}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

function VariasEscolhas({
  rotulo,
  opcoes,
  valores,
  aoMudar,
  colunas,
}: {
  rotulo: string;
  opcoes: readonly string[];
  valores: readonly string[];
  /** Recebe a opção clicada: quem guarda a resposta decide sobre o valor mais recente. */
  aoMudar: (opcao: string) => void;
  colunas: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className={`gap-2 ${colunas}`}>
      {opcoes.map(opcao => {
        const ligada = valores.includes(opcao);
        return (
          <button
            key={opcao}
            type="button"
            aria-pressed={ligada}
            onClick={() => aoMudar(opcao)}
            className={`${opcaoBase} ${ligada ? marcada : livre}`}
          >
            {opcao}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Escalas longas (0–10, 1–10) quebram em linhas centradas no celular, para nenhuma linha ficar
 * torta; da largura de tablet em diante, ficam numa linha só, com as casas do mesmo tamanho.
 */
function colunasDaEscala(n: number): { colunas: string; larguraDoItem?: string } {
  if (n <= 7) return { colunas: n === 5 ? "grid grid-cols-5" : "grid grid-cols-7" };
  return {
    colunas: `flex flex-wrap justify-center sm:grid ${n === 10 ? "sm:grid-cols-10" : "sm:grid-cols-11"}`,
    larguraDoItem: "w-12 sm:w-auto",
  };
}

const colunasDaGrade = (n: number) => (n >= 6 ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : n === 3 ? "grid grid-cols-1 sm:grid-cols-3" : "grid grid-cols-2 sm:grid-cols-4");

function Pergunta({
  item,
  respostas,
  responder,
  alternar,
  erroDoEmail,
  emailDoLogin,
}: {
  item: ItemDaAvaliacao;
  respostas: RespostasDaAvaliacao;
  responder: (entry: string, valor: string | string[]) => void;
  alternar: (entry: string, opcao: string) => void;
  erroDoEmail: boolean;
  /** Com o login conhecido, a pergunta do e-mail vira só leitura: a resposta é o e-mail da conta. */
  emailDoLogin: string | null;
}) {
  const id = useId();
  const texto = (entry: string) => {
    const v = respostas[entry];
    return typeof v === "string" ? v : "";
  };
  const lista = (entry: string) => {
    const v = respostas[entry];
    return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
  };

  if (item.tipo === "aviso") {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-4 text-center text-sm">
        {item.titulo && <p className="font-semibold text-foreground">{item.titulo}</p>}
        <TextoComLinks texto={item.ajuda} className="mt-1 space-y-2 text-muted-foreground" />
      </div>
    );
  }

  const cabecalho = (
    <div className="space-y-1">
      <p id={`${id}-titulo`} className="font-semibold leading-snug text-foreground">
        {item.titulo}
      </p>
      <TextoComLinks texto={item.ajuda} className="space-y-2 text-[13px] text-muted-foreground" />
    </div>
  );

  return (
    <fieldset aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      {cabecalho}

      {item.tipo === "texto" && item.email && emailDoLogin && (
        <p className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          Você responde como <span className="font-semibold text-foreground">{emailDoLogin}</span>, o e-mail do seu login. Ele vai
          junto com a avaliação, sem precisar digitar.
        </p>
      )}

      {item.tipo === "texto" && !(item.email && emailDoLogin) && (
        <>
          <Input
            aria-labelledby={`${id}-titulo`}
            type={item.email ? "email" : "text"}
            autoComplete={item.email ? "email" : "off"}
            value={texto(item.entry)}
            onChange={e => responder(item.entry, e.target.value)}
            aria-invalid={erroDoEmail || undefined}
            aria-describedby={erroDoEmail ? `${id}-erro` : undefined}
            className="h-11"
          />
          {erroDoEmail && (
            <p id={`${id}-erro`} className="text-sm text-destructive">
              Confira o e-mail: ele precisa ter o formato nome@dominio.com. Com ele inválido, o Google recusa a avaliação inteira.
            </p>
          )}
        </>
      )}

      {item.tipo === "paragrafo" && (
        <Textarea
          aria-labelledby={`${id}-titulo`}
          value={texto(item.entry)}
          onChange={e => responder(item.entry, e.target.value)}
          rows={4}
          className="resize-y"
        />
      )}

      {item.tipo === "escolha" && (
        <EscolhaUnica
          rotulo={item.titulo}
          opcoes={item.opcoes}
          valor={texto(item.entry)}
          aoMudar={v => responder(item.entry, v)}
          colunas={item.opcoes.length === 4 ? "grid grid-cols-2 sm:grid-cols-4" : "grid grid-cols-1"}
        />
      )}

      {item.tipo === "caixas" && (
        <VariasEscolhas rotulo={item.titulo} opcoes={item.opcoes} valores={lista(item.entry)} aoMudar={o => alternar(item.entry, o)} colunas="grid grid-cols-1 sm:grid-cols-2" />
      )}

      {item.tipo === "escala" && (
        <div className="space-y-2">
          <EscolhaUnica
            rotulo={`${item.titulo} (${item.valores[0]} = ${item.rotulos[0]}; ${item.valores[item.valores.length - 1]} = ${item.rotulos[1]})`}
            opcoes={item.valores}
            valor={texto(item.entry)}
            aoMudar={v => responder(item.entry, v)}
            {...colunasDaEscala(item.valores.length)}
          />
          <div aria-hidden="true" className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>{item.rotulos[0]}</span>
            <span className="text-right">{item.rotulos[1]}</span>
          </div>
        </div>
      )}

      {item.tipo === "grade" && (
        <div className="space-y-4">
          {item.linhas.map(linha => (
            <div key={linha.entry} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm text-foreground">{linha.rotulo}</p>
              {item.multipla ? (
                <VariasEscolhas
                  rotulo={linha.rotulo}
                  opcoes={item.colunas}
                  valores={lista(linha.entry)}
                  aoMudar={o => alternar(linha.entry, o)}
                  colunas={colunasDaGrade(item.colunas.length)}
                />
              ) : (
                <EscolhaUnica
                  rotulo={linha.rotulo}
                  opcoes={item.colunas}
                  valor={texto(linha.entry)}
                  aoMudar={v => responder(linha.entry, v)}
                  colunas={colunasDaGrade(item.colunas.length)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Aviso({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div role="status" className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-6 text-center">
      <span className="text-primary">{icone}</span>
      <p className="text-lg font-semibold text-foreground">{titulo}</p>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function tituloDaPagina(pagina: PaginaDaAvaliacao, indice: number) {
  return pagina.titulo || (indice === 0 ? "Início" : `Página ${indice + 1}`);
}

export function FormularioDaAvaliacao({ formulario, usuario, email, confirmacao, linkDoGoogle }: Props) {
  const chave = chaveDoRascunho(formulario, usuario);
  const [inicial] = useState(() => lerRascunho(ler(chave), formulario));
  const [pagina, setPagina] = useState(inicial?.pagina ?? 0);
  const comEmail = (salvas: RespostasDaAvaliacao): RespostasDaAvaliacao => {
    const itemDoEmail = formulario.paginas[0]?.itens.find(i => i.tipo === "texto" && i.email);
    // O e-mail da conta sempre vence o do rascunho: é por ele que a equipe liga a avaliação à inscrição.
    if (email && itemDoEmail && itemDoEmail.tipo === "texto") {
      return { ...salvas, [itemDoEmail.entry]: email };
    }
    return salvas;
  };
  const [respostas, setRespostas] = useState<RespostasDaAvaliacao>(() => comEmail(inicial?.respostas ?? {}));
  const [enviadoEm, setEnviadoEm] = useState<string | null>(inicial?.enviadoEm ?? null);
  const [etapa, setEtapa] = useState<Etapa>("respondendo");
  const [emailInvalido, setEmailInvalido] = useState(false);
  const codigo = useRef<string | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    guardar(chave, { pagina, respostas, enviadoEm });
  }, [chave, pagina, respostas, enviadoEm]);

  const total = formulario.paginas.length;
  const atual = formulario.paginas[pagina];
  const ultima = pagina === total - 1;
  const conferivel = !!(confirmacao && formulario.codigo);

  const irPara = (indice: number) => {
    setPagina(Math.min(Math.max(indice, 0), total - 1));
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const responder = (entry: string, valor: string | string[]) => {
    setRespostas(r => ({ ...r, [entry]: valor }));
    if (emailInvalido) setEmailInvalido(false);
  };

  const alternar = (entry: string, opcao: string) =>
    setRespostas(r => {
      const atual = r[entry];
      const lista = Array.isArray(atual) ? atual : typeof atual === "string" && atual ? [atual] : [];
      return { ...r, [entry]: lista.includes(opcao) ? lista.filter(v => v !== opcao) : [...lista, opcao] };
    });

  const conferir = async () => {
    if (!confirmacao || !codigo.current) return;
    setEtapa("conferindo");
    for (const ms of ESPERAS_DA_CONFERENCIA_MS) {
      await esperar(ms);
      if (await codigoChegou(confirmacao, codigo.current)) {
        setEtapa("recebida");
        void marcarAvaliacaoEnviada();
        return;
      }
    }
    setEtapa("sem-confirmacao");
  };

  const enviar = async () => {
    if (emailsInvalidos(formulario, respostas).length) {
      setEmailInvalido(true);
      irPara(0);
      return;
    }
    // Um código por envio: se a pessoa reenviar depois de um erro de rede, é outro envio.
    codigo.current = crypto.randomUUID();
    setEtapa("enviando");
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      await fetch(urlDoEnvioDaAvaliacao(formulario), {
        method: "POST",
        mode: "no-cors",
        body: corpoDaAvaliacao(formulario, respostas, codigo.current),
      });
    } catch {
      setEtapa("erro");
      return;
    }
    setEnviadoEm(new Date().toISOString());
    if (conferivel) await conferir();
    else {
      setEtapa("enviada");
      void marcarAvaliacaoEnviada();
    }
  };

  const apagarRascunho = () => {
    apagar(chave);
    setRespostas(comEmail({}));
    setEnviadoEm(null);
    setPagina(0);
    setEtapa("respondendo");
  };

  const linkDoGoogleEl = (
    <a className="inline-flex items-center gap-1 font-semibold text-primary" href={linkDoGoogle} target="_blank" rel="noopener noreferrer">
      Abrir o formulário no Google <ExternalLink size={16} aria-hidden="true" />
    </a>
  );

  if (etapa === "enviando" || etapa === "conferindo") {
    return (
      <div ref={topo} role="status" aria-live="polite" className="mx-auto flex max-w-2xl scroll-mt-24 flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden="true" />
        <p className="font-semibold text-foreground">{etapa === "enviando" ? "Enviando a sua avaliação…" : "Conferindo se a avaliação chegou…"}</p>
        <p className="text-sm text-muted-foreground">Leva alguns segundos. Não feche a página.</p>
      </div>
    );
  }

  if (etapa !== "respondendo") {
    return (
      <div ref={topo} className="scroll-mt-24">
        {etapa === "recebida" && (
          <Aviso icone={<CheckCircle2 size={32} aria-hidden="true" />} titulo="Avaliação recebida. Obrigado pela sua avaliação.">
            <p>O resumo dos resultados vai para o e-mail que você cadastrou.</p>
            <p>Suas respostas continuam guardadas neste navegador até você apagar.</p>
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={apagarRascunho}>
              <Trash2 size={16} aria-hidden="true" /> Apagar as respostas deste navegador
            </button>
          </Aviso>
        )}
        {etapa === "enviada" && (
          <Aviso icone={<Send size={30} aria-hidden="true" />} titulo="Avaliação enviada. Obrigado pela sua avaliação.">
            <p>
              O Google não devolve confirmação para esta página, então não temos como mostrar aqui que ela chegou. Se quiser
              certeza, escreva para o contato da cartilha: a equipe confere na planilha.
            </p>
            <p>Suas respostas continuam guardadas neste navegador até você apagar.</p>
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={apagarRascunho}>
              <Trash2 size={16} aria-hidden="true" /> Apagar as respostas deste navegador
            </button>
          </Aviso>
        )}
        {etapa === "sem-confirmacao" && (
          <Aviso icone={<RefreshCw size={30} aria-hidden="true" />} titulo="Ainda não conseguimos confirmar que a avaliação chegou.">
            <p>Às vezes ela chega e só demora a aparecer. Confira de novo daqui a pouco. Suas respostas continuam aqui.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={conferir}>
                <RefreshCw size={16} aria-hidden="true" /> Conferir de novo
              </button>
              {linkDoGoogleEl}
            </div>
          </Aviso>
        )}
        {etapa === "erro" && (
          <Aviso icone={<RefreshCw size={30} aria-hidden="true" />} titulo="A avaliação não saiu desta página.">
            <p>A conexão caiu antes do envio. Suas respostas continuam aqui; tente de novo quando a internet voltar.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => setEtapa("respondendo")}>
                <ArrowLeft size={16} aria-hidden="true" /> Voltar às respostas
              </button>
              {linkDoGoogleEl}
            </div>
          </Aviso>
        )}
      </div>
    );
  }

  const andamento = andamentoDaPagina(atual, respostas);
  const entryDoEmail = formulario.paginas[0]?.itens.find(i => i.tipo === "texto" && i.email);

  return (
    <div ref={topo} className="mx-auto flex w-full max-w-3xl scroll-mt-24 flex-col gap-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Página {pagina + 1} de {total}
          </span>
          <span className="inline-flex items-center gap-1">
            <Save size={13} aria-hidden="true" /> Rascunho guardado neste navegador
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Andamento da avaliação"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={pagina + 1}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((pagina + 1) / total) * 100}%` }} />
        </div>
        <label className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <span className="sr-only">Ir para a página</span>
          <select
            value={pagina}
            onChange={e => irPara(Number(e.target.value))}
            className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-center text-sm text-foreground"
          >
            {formulario.paginas.map((p, i) => {
              const a = andamentoDaPagina(p, respostas);
              return (
                <option key={i} value={i}>
                  {i + 1}. {tituloDaPagina(p, i)}
                  {a.total ? ` (${a.respondidas}/${a.total})` : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {enviadoEm && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
          Você já enviou esta avaliação em {new Date(enviadoEm).toLocaleString("pt-BR")}. Se enviar de novo, a equipe recebe uma
          segunda resposta.
        </p>
      )}

      <header className="space-y-2 text-center">
        <h2 className="text-lg font-bold text-foreground">{pagina === 0 ? formulario.titulo : tituloDaPagina(atual, pagina)}</h2>
        <TextoComLinks
          texto={pagina === 0 ? formulario.descricao : atual.ajuda}
          className="mx-auto max-w-2xl space-y-2 text-left text-sm leading-relaxed text-muted-foreground"
        />
      </header>

      <div className="flex flex-col gap-4">
        {atual.itens.map((item, i) => (
          <Pergunta
            key={`${pagina}-${i}`}
            item={item}
            respostas={respostas}
            responder={responder}
            alternar={alternar}
            erroDoEmail={emailInvalido && item === entryDoEmail}
            emailDoLogin={email}
          />
        ))}
      </div>

      {andamento.total > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {andamento.respondidas} de {andamento.total} respondidas nesta página. Nenhuma é obrigatória.
        </p>
      )}

      <nav aria-label="Páginas da avaliação" className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => irPara(pagina - 1)}
          disabled={pagina === 0}
          className="journey-button inline-flex justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Voltar
        </button>
        {ultima ? (
          <button type="button" onClick={enviar} className="journey-button journey-button-coral inline-flex justify-center">
            Enviar avaliação <Send size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={() => irPara(pagina + 1)} className="journey-button journey-button-coral inline-flex justify-center">
            Continuar <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </nav>

      <p className="text-center text-xs text-muted-foreground">
        Prefere responder no Google? {linkDoGoogleEl}. Envie por um lugar só, para a sua avaliação não contar duas vezes.
      </p>
    </div>
  );
}
