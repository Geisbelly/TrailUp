import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Trash2, UserCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { iniciais } from "./meusdados/conta";
import { DIAS_URGENTE, dataCurta, diasAguardando, emailDeOutraInstituicao, resumoProfessor, rotuloEspera } from "./aprovacoes/aprovacoes";

type PendingProfessor = {
  id: string;
  nome: string;
  instituicao: string | null;
  disciplina: string | null;
  descricao: string | null;
  created_at: string;
  /** Vem da função aprovacoes_pendentes(); null quando só a tabela pôde ser lida. */
  email?: string | null;
};

export function ProfessorApprovalSection() {
  const [professors, setProfessors] = useState<PendingProfessor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { user } = useAuth();
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{ nome: string; liberado_em: string } | null>(null);

  const loadPending = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    // Preferência: a função do banco, que traz o e-mail (auth.users) e só responde ao dono.
    // Se ela ainda não existe (migration não aplicada) ou falha, cai na leitura da tabela,
    // sem e-mail — a fila continua funcionando em vez de quebrar.
    const viaFuncao = await supabase.rpc("aprovacoes_pendentes" as never);
    let data = (viaFuncao.data ?? null) as PendingProfessor[] | null;
    let error: unknown = viaFuncao.error;
    if (viaFuncao.error) {
      // Ordem do mais antigo para o mais novo: quem espera há mais tempo aparece primeiro.
      const resp = await supabase
        .from("professor")
        .select("id, nome, instituicao, disciplina, descricao, created_at")
        .eq("liberado", false)
        .order("created_at", { ascending: true });
      data = resp.data as PendingProfessor[] | null;
      error = resp.error;
    }

    if (error) {
      // Erro não pode virar "nenhum pendente": o dono acharia que a fila está vazia.
      setLoadError(true);
      toast.error("Erro ao carregar professores pendentes.");
    } else {
      setProfessors(data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // "Última aprovação" do estado vazio. Opcional: se a função não existe ainda ou ninguém tem data
  // (liberados antes da coluna liberado_em), a frase simplesmente não aparece.
  useEffect(() => {
    let ativo = true;
    supabase.rpc("aprovacoes_ultima" as never).then(({ data, error }) => {
      const lista = data as unknown as { nome: string; liberado_em: string }[] | null;
      const linha = Array.isArray(lista) && lista.length > 0 ? lista[0] : null;
      if (ativo && !error && linha && linha.nome && linha.liberado_em) setUltima(linha);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const approve = async (professorId: string) => {
    setProcessing(professorId);
    const { error } = await supabase.from("professor").update({ liberado: true }).eq("id", professorId);

    if (error) {
      toast.error("Erro ao aprovar professor.");
    } else {
      toast.success("Professor aprovado com sucesso!");
      setProfessors((prev) => prev.filter((p) => p.id !== professorId));
    }
    setProcessing(null);
  };

  const reject = async (professorId: string) => {
    setProcessing(professorId);
    const { error } = await supabase.from("professor").delete().eq("id", professorId);

    if (error) {
      toast.error("Erro ao recusar professor.");
    } else {
      toast.success("Cadastro recusado.");
      setProfessors((prev) => prev.filter((p) => p.id !== professorId));
      setRejecting(null);
    }
    setProcessing(null);
  };

  const maisAntigo = useMemo(() => professors[0]?.created_at ?? null, [professors]);
  const count = professors.length;

  return (
    <div className="space-y-6">
      <div>
        <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/15 px-[13px] py-[5px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-warning">
          Administração interna
        </span>
        <h2 className="mt-3 text-[30px] font-bold leading-tight">Aprovações</h2>
        <p className="mt-2 text-sm text-muted-foreground">Cadastros aguardando liberação de acesso ao console.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16" role="status" aria-label="Carregando cadastros pendentes">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-[20px] border border-destructive/50 bg-card px-10 py-16 text-center">
          <p className="text-lg font-bold">Não foi possível carregar a fila</p>
          <p className="max-w-md text-sm text-muted-foreground">Isto não significa que não há cadastros pendentes. Tente de novo.</p>
          <Button variant="outline" className="rounded-full" onClick={loadPending}>
            Tentar de novo
          </Button>
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[20px] border bg-card px-10 py-20 text-center">
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-7 w-7" strokeWidth={2.4} />
          </span>
          <h3 className="text-[22px] font-bold">Nenhum professor aguardando aprovação</h3>
          <p className="max-w-[440px] text-sm leading-relaxed text-muted-foreground">Novos cadastros aparecem aqui quando alguém se inscrever.</p>
          {ultima && (
            <p className="text-[12.5px] text-muted-foreground">
              Última aprovação: {ultima.nome}, em {dataCurta(ultima.liberado_em)}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-[18px] rounded-[20px] border border-warning/40 bg-card px-[22px] py-[18px]">
            <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-warning/40 bg-warning/15 text-xl font-extrabold text-warning">
              {count}
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold">{count === 1 ? "1 cadastro pendente" : `${count} cadastros pendentes`}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                A pessoa só consegue entrar no console depois da aprovação.
                {maisAntigo && ` O mais antigo espera desde ${dataCurta(maisAntigo)}.`}
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-4">
            {professors.map((prof) => {
              const dias = diasAguardando(prof.created_at);
              const ocupado = processing === prof.id;
              return (
                <li key={prof.id} className="rounded-[20px] border bg-card px-6 py-[22px]">
                  <div className="flex flex-wrap items-start gap-[15px]">
                    <span aria-hidden="true" className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-muted text-[13px] font-extrabold">
                      {iniciais(prof.nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[16.5px] font-bold">{prof.nome}</h3>
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">{resumoProfessor(prof.instituicao, prof.disciplina)}</p>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        {prof.email ? `${prof.email} · ` : ""}cadastro em {dataCurta(prof.created_at)}
                      </p>
                      {emailDeOutraInstituicao(prof.email, user?.email) && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-warning">
                          <AlertTriangle className="h-3 w-3 flex-none" aria-hidden="true" />
                          E-mail de instituição diferente da sua.
                        </p>
                      )}
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-3 py-[5px] text-[10.5px] font-bold ${
                        dias >= DIAS_URGENTE ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rotuloEspera(dias)}
                    </span>
                  </div>

                  <p className="mt-[15px] rounded-[14px] bg-muted px-[15px] py-[13px] text-[13.5px] leading-relaxed text-muted-foreground">
                    {prof.descricao?.trim() ? prof.descricao : "Sem descrição preenchida."}
                  </p>

                  <div className="mt-[18px] flex flex-wrap items-center gap-3 border-t pt-4">
                    <Button className="rounded-full px-[22px] font-bold" onClick={() => approve(prof.id)} disabled={ocupado}>
                      {ocupado && rejecting !== prof.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <UserCheck className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Aprovar acesso
                    </Button>
                    {rejecting !== prof.id && (
                      <Button variant="ghost" className="ml-auto rounded-full text-muted-foreground" onClick={() => setRejecting(prof.id)} disabled={ocupado}>
                        Recusar cadastro…
                      </Button>
                    )}
                  </div>

                  {rejecting === prof.id && (
                    <div role="alertdialog" aria-label={`Recusar o cadastro de ${prof.nome}`} className="mt-[15px] rounded-2xl border border-destructive/50 bg-destructive/15 px-[19px] py-[17px]">
                      <p className="text-sm font-bold">Recusar o cadastro de {prof.nome}?</p>
                      <p className="mt-[7px] text-[12.5px] leading-relaxed text-muted-foreground">
                        O cadastro é apagado — não fica em uma lista de recusados. A pessoa precisaria se cadastrar de novo do zero para tentar outra vez.
                      </p>
                      <div className="mt-3.5 flex flex-wrap justify-end gap-2.5">
                        <Button variant="outline" className="rounded-full border-destructive/50" onClick={() => setRejecting(null)} disabled={ocupado}>
                          Voltar
                        </Button>
                        <Button variant="destructive" className="rounded-full font-bold" onClick={() => reject(prof.id)} disabled={ocupado}>
                          {ocupado ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
                          Recusar e apagar cadastro
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

    </div>
  );
}
