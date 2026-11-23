import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CAMPOS_DE_IDENTIFICACAO, type CampoDeIdentificacao } from "@/features/pesquisa/pesquisaProfessores";
import {
  ACEITE,
  AJUDA_DO_ACEITE,
  ESPERAS_DA_CONFERENCIA_MS,
  PERGUNTA_DO_EMAIL,
  RECUSA,
  TERMO_DE_CONSENTIMENTO,
  corpoDoEnvio,
  emailAceito,
  lerConfirmacao,
  urlDaConferencia,
  urlDoEnvio,
  type FormularioDoSite,
} from "@/features/pesquisa/inscricaoNoSite";

type Etapa = "termo" | "recusou" | "dados" | "enviando" | "conferindo" | "recebida" | "sem-confirmacao" | "erro";

type Props = {
  formulario: FormularioDoSite;
  /** App da Web do Apps Script que responde se o código chegou. */
  confirmacao: string;
  /** Link do Google Forms, para quando a confirmação não vier. */
  linkDoGoogle: string;
};

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function codigoChegou(confirmacao: string, codigo: string): Promise<boolean> {
  try {
    const resposta = await fetch(urlDaConferencia(confirmacao, codigo), { cache: "no-store" });
    return resposta.ok && lerConfirmacao(await resposta.json());
  } catch {
    return false;
  }
}

function Passo({ numero, titulo, atual }: { numero: number; titulo: string; atual: boolean }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
          atual ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
        }`}
      >
        {numero}
      </span>
      {titulo}
    </li>
  );
}

function Aviso({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-primary/40 bg-primary/10 p-5">
      <span className="mt-0.5 shrink-0 text-primary">{icone}</span>
      <div className="space-y-2">
        <p className="font-semibold text-foreground">{titulo}</p>
        <div className="space-y-2 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Escolha({
  campo,
  valor,
  aoMudar,
}: {
  campo: CampoDeIdentificacao;
  valor: string;
  aoMudar: (valor: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 font-medium text-foreground">{campo.pergunta}</legend>
      <RadioGroup value={valor} onValueChange={aoMudar} className="grid gap-2 sm:grid-cols-2">
        {campo.opcoes!.map((opcao, i) => (
          <Label
            key={opcao}
            htmlFor={`${id}-${i}`}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-normal leading-snug transition-colors ${
              valor === opcao ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <RadioGroupItem id={`${id}-${i}`} value={opcao} />
            {opcao}
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function Texto({
  campo,
  valor,
  aoMudar,
  erro,
}: {
  campo: CampoDeIdentificacao;
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string;
}) {
  const id = useId();
  const email = campo.pergunta === PERGUNTA_DO_EMAIL;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-medium text-foreground">
        {campo.pergunta}
      </Label>
      <Input
        id={id}
        type={email ? "email" : "text"}
        autoComplete={email ? "email" : campo.pergunta === "Nome completo" ? "name" : campo.pergunta.startsWith("Instituição") ? "organization" : "off"}
        value={valor}
        onChange={e => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className="h-11"
      />
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

export function InscricaoNoSite({ formulario, confirmacao, linkDoGoogle }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("termo");
  const [aceite, setAceite] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [erroDoEmail, setErroDoEmail] = useState<string>();
  const codigo = useRef<string | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  const irPara = (proxima: Etapa) => {
    setEtapa(proxima);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const conferir = async () => {
    if (!codigo.current) return;
    setEtapa("conferindo");
    for (const ms of ESPERAS_DA_CONFERENCIA_MS) {
      await esperar(ms);
      if (await codigoChegou(confirmacao, codigo.current)) {
        irPara("recebida");
        return;
      }
    }
    irPara("sem-confirmacao");
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailAceito(respostas[PERGUNTA_DO_EMAIL] ?? "")) {
      setErroDoEmail("Confira o e-mail: ele precisa ter o formato nome@dominio.com.");
      return;
    }
    setErroDoEmail(undefined);
    // Um código por inscrição: se a pessoa reenviar depois de um erro de rede, é outro envio.
    codigo.current = crypto.randomUUID();
    setEtapa("enviando");
    try {
      await fetch(urlDoEnvio(formulario), {
        method: "POST",
        mode: "no-cors",
        body: corpoDoEnvio(formulario, respostas, codigo.current),
      });
    } catch {
      irPara("erro");
      return;
    }
    await conferir();
  };

  const responder = (pergunta: string) => (valor: string) => setRespostas(r => ({ ...r, [pergunta]: valor }));

  return (
    <div ref={topo} className="scroll-mt-24 space-y-6">
      {(etapa === "termo" || etapa === "dados") && (
        <ol aria-label="Etapas da inscrição" className="flex flex-wrap gap-x-6 gap-y-2">
          <Passo numero={1} titulo="Termo de consentimento" atual={etapa === "termo"} />
          <Passo numero={2} titulo="Sua identificação" atual={etapa === "dados"} />
        </ol>
      )}

      {etapa === "termo" && (
        <form
          className="space-y-6"
          onSubmit={e => {
            e.preventDefault();
            irPara(aceite === ACEITE ? "dados" : "recusou");
          }}
        >
          <article className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7">
            <h3 className="font-bold text-foreground">Termo de consentimento</h3>
            {TERMO_DE_CONSENTIMENTO.map(([titulo, texto]) => (
              <section key={titulo} className="space-y-2">
                <h4 className="font-semibold text-foreground">{titulo}</h4>
                {texto.split("\n\n").map(paragrafo => (
                  <p key={paragrafo.slice(0, 40)} className="text-sm leading-relaxed text-muted-foreground">
                    {paragrafo}
                  </p>
                ))}
              </section>
            ))}
            <p className="flex gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              Este termo fica sempre nesta página. Guarde o link se quiser relê-lo.
            </p>
          </article>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold text-foreground">Consentimento</legend>
            <p className="text-sm text-muted-foreground">{AJUDA_DO_ACEITE}</p>
            <RadioGroup value={aceite} onValueChange={setAceite} className="grid gap-2 sm:grid-cols-2">
              {[ACEITE, RECUSA].map(opcao => (
                <Label
                  key={opcao}
                  htmlFor={`aceite-${opcao}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 font-medium transition-colors ${
                    aceite === opcao ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem id={`aceite-${opcao}`} value={opcao} />
                  {opcao}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <button type="submit" disabled={!aceite} className="journey-button journey-button-coral inline-flex disabled:cursor-not-allowed disabled:opacity-50">
            Continuar <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      )}

      {etapa === "recusou" && (
        <Aviso icone={<CheckCircle2 size={22} aria-hidden="true" />} titulo="Tudo bem, nada foi enviado.">
          <p>Você não se inscreveu e nenhum dado seu saiu desta página. Se mudar de ideia, é só voltar ao termo.</p>
          <button type="button" className="journey-link inline-flex items-center gap-1 font-semibold text-primary" onClick={() => irPara("termo")}>
            <ArrowLeft size={16} aria-hidden="true" /> Voltar ao termo
          </button>
        </Aviso>
      )}

      {etapa === "dados" && (
        <form className="space-y-8" onSubmit={enviar} noValidate>
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhuma pergunta é obrigatória. O e-mail que você informar será o seu login no TrailUp, e é para ele que a equipe
            manda o acesso. O que aparece na monografia você só escolhe no fim da avaliação.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {CAMPOS_DE_IDENTIFICACAO.filter(c => !c.opcoes).map(campo => (
              <Texto
                key={campo.pergunta}
                campo={campo}
                valor={respostas[campo.pergunta] ?? ""}
                aoMudar={responder(campo.pergunta)}
                erro={campo.pergunta === PERGUNTA_DO_EMAIL ? erroDoEmail : undefined}
              />
            ))}
          </div>
          {CAMPOS_DE_IDENTIFICACAO.filter(c => c.opcoes).map(campo => (
            <Escolha key={campo.pergunta} campo={campo} valor={respostas[campo.pergunta] ?? ""} aoMudar={responder(campo.pergunta)} />
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="journey-button journey-button-coral inline-flex">
              Enviar inscrição <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => irPara("termo")}>
              <ArrowLeft size={16} aria-hidden="true" /> Voltar ao termo
            </button>
          </div>
        </form>
      )}

      {(etapa === "enviando" || etapa === "conferindo") && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
          <Loader2 className="shrink-0 animate-spin text-primary" size={22} aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">{etapa === "enviando" ? "Enviando a sua inscrição…" : "Conferindo se a inscrição chegou…"}</p>
            <p className="text-sm text-muted-foreground">Leva alguns segundos. Não feche a página.</p>
          </div>
        </div>
      )}

      {etapa === "recebida" && (
        <Aviso icone={<CheckCircle2 size={22} aria-hidden="true" />} titulo="Inscrição recebida.">
          <p>
            A equipe confere cada inscrição. Quando a sua for aprovada, chega no e-mail que você informou um link para confirmar o
            endereço e, depois dele, o seu acesso ao TrailUp, o do aluno de teste e o link da avaliação.
          </p>
          <p>Se não chegar nada em alguns dias, confira a caixa de spam ou escreva para o contato do termo.</p>
        </Aviso>
      )}

      {etapa === "sem-confirmacao" && (
        <Aviso icone={<RefreshCw size={22} aria-hidden="true" />} titulo="Não conseguimos confirmar que a inscrição chegou.">
          <p>
            Ela pode ter chegado e só demorado a aparecer. Confira de novo daqui a pouco; se continuar assim, faça a inscrição pelo
            formulário do Google, que vai para o mesmo lugar.
          </p>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={conferir}>
              <RefreshCw size={16} aria-hidden="true" /> Conferir de novo
            </button>
            <a className="inline-flex items-center gap-1 font-semibold text-primary" href={linkDoGoogle} target="_blank" rel="noopener noreferrer">
              Abrir o formulário do Google <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </Aviso>
      )}

      {etapa === "erro" && (
        <Aviso icone={<RefreshCw size={22} aria-hidden="true" />} titulo="A inscrição não saiu desta página.">
          <p>Parece que a conexão caiu antes do envio. As suas respostas continuam aqui.</p>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => irPara("dados")}>
              <ArrowLeft size={16} aria-hidden="true" /> Voltar às respostas
            </button>
            <a className="inline-flex items-center gap-1 font-semibold text-primary" href={linkDoGoogle} target="_blank" rel="noopener noreferrer">
              Abrir o formulário do Google <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </Aviso>
      )}
    </div>
  );
}
