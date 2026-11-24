import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, GraduationCap } from "lucide-react";
import { TAREFAS, linkEmbutido, type MeuAcessoNaPesquisa } from "@/features/pesquisa/pesquisaProfessores";
import { formularioDeAvaliacao, type FormularioDeAvaliacao } from "@/features/pesquisa/formularioDeAvaliacao";
import { linkDaConfirmacao } from "@/features/pesquisa/inscricaoNoSite";
import { useAuth } from "@/hooks/useAuth";
import { consolePathForView } from "@/pages/consoleSections";
import { FormularioDaAvaliacao } from "./FormularioDaAvaliacao";

// O mesmo App da Web da inscrição responde pelos dois formulários (`formulario=avaliacao`).
const CONFIRMACAO = linkDaConfirmacao(import.meta.env.VITE_PESQUISA_INSCRICAO_CONFIRMACAO_URL);

/**
 * Aba "Avaliar o TrailUp": o formulário da avaliação dentro do console, para quem a equipe aprovou
 * na pesquisa com professores. O link vem do banco (`pesquisa_meu_acesso()`), não do bundle.
 * Quando ele é o formulário espelhado em formularioDeAvaliacao.gerado.ts, as perguntas são
 * desenhadas aqui; senão, a aba mostra o Google Forms num iframe, como antes.
 */
export default function AvaliacaoDaPesquisaSection({ acesso }: { acesso: MeuAcessoNaPesquisa }) {
  const { user } = useAuth();
  // undefined = ainda conferindo o link (um hash, instantâneo); null = usa o iframe do Google.
  const [nativo, setNativo] = useState<FormularioDeAvaliacao | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    formularioDeAvaliacao(acesso.linkAvaliacao)
      .catch(() => null)
      .then(f => vivo && setNativo(f));
    return () => {
      vivo = false;
    };
  }, [acesso.linkAvaliacao]);
  const embutido = nativo === null ? linkEmbutido(acesso.linkAvaliacao) : null;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-foreground">Avaliar o TrailUp</h1>
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          Faça as tarefas do roteiro com o console aberto em outra aba e volte aqui para responder. Cada tarefa tem quatro
          perguntas rápidas. Contar que não conseguiu ajuda tanto quanto contar que conseguiu.
        </p>
        {!acesso.avaliador && (
          <p className="text-[12px] text-muted-foreground">Você vê esta aba porque administra o projeto.</p>
        )}
      </header>

      <div className="flex flex-wrap gap-3">
        {acesso.linkAvaliacao ? (
          <a className="journey-button journey-button-coral inline-flex" href={acesso.linkAvaliacao} target="_blank" rel="noopener noreferrer">
            Abrir o formulário em outra aba <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ) : (
          <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
            O formulário da avaliação ainda não foi configurado pela equipe. Ele também chega no e-mail com o seu acesso.
          </p>
        )}
        <Link className="journey-button inline-flex" to="/pesquisa/professores" target="_blank" rel="noopener noreferrer">
          <BookOpen size={16} aria-hidden="true" /> Cartilha e roteiro
        </Link>
      </div>

      <section aria-labelledby="avaliacao-acessos" className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <h2 id="avaliacao-acessos" className="mb-2 font-semibold text-foreground">Seus acessos</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            A sua turma de demonstração está em{" "}
            <Link className="text-primary underline" to={consolePathForView("classes")}>Turmas</Link>. Ela é só sua: pode
            mexer, pôr conteúdo seu e errar à vontade.
          </li>
          {acesso.alunoTesteEmail && (
            <li>
              Aluno de teste, no app: <span className="font-mono text-foreground">{acesso.alunoTesteEmail}</span> (a senha está no
              e-mail do acesso). No primeiro login, faça o cadastro do aluno; ao terminar, ele entra na sua turma sozinho.
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="avaliacao-roteiro" className="flex flex-col gap-2">
        <h2 id="avaliacao-roteiro" className="font-semibold text-foreground">Roteiro</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {TAREFAS.map(tarefa => (
            <li key={tarefa.id} className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              {tarefa.onde === "aluno" ? <GraduationCap size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /> : <span className="font-semibold text-primary">{tarefa.id}</span>}
              <span className="text-foreground">{tarefa.onde === "aluno" ? `${tarefa.id} ${tarefa.titulo}` : tarefa.titulo}</span>
            </li>
          ))}
        </ol>
      </section>

      {nativo && acesso.linkAvaliacao && (
        <section aria-labelledby="avaliacao-formulario" className="flex flex-col gap-4 border-t border-border pt-6">
          <h2 id="avaliacao-formulario" className="text-center font-semibold text-foreground">
            Formulário
          </h2>
          <FormularioDaAvaliacao
            formulario={nativo}
            usuario={user?.id ?? "anonimo"}
            email={user?.email ?? null}
            confirmacao={CONFIRMACAO}
            linkDoGoogle={acesso.linkAvaliacao}
          />
        </section>
      )}

      {embutido && (
        <section aria-labelledby="avaliacao-formulario" className="flex flex-col gap-2">
          <h2 id="avaliacao-formulario" className="font-semibold text-foreground">Formulário</h2>
          <iframe
            title="Formulário de avaliação do TrailUp"
            src={embutido}
            className="h-[1400px] w-full rounded-lg border border-border bg-white"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </section>
      )}
    </div>
  );
}
