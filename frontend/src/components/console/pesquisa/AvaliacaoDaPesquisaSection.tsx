import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, GraduationCap } from "lucide-react";
import { TAREFAS, linkEmbutido, type MeuAcessoNaPesquisa } from "@/features/pesquisa/pesquisaProfessores";
import { consolePathForView } from "@/pages/consoleSections";

/**
 * Aba "Avaliar o TrailUp": o formulário da avaliação dentro do console, para quem a equipe aprovou
 * na pesquisa com professores. O link vem do banco (`pesquisa_meu_acesso()`), não do bundle.
 */
export default function AvaliacaoDaPesquisaSection({ acesso }: { acesso: MeuAcessoNaPesquisa }) {
  const embutido = linkEmbutido(acesso.linkAvaliacao);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-foreground">Avaliar o TrailUp</h1>
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          Siga o roteiro com o console numa aba e o formulário na outra. Depois de cada tarefa, responda às quatro perguntas
          rápidas. Dizer que não conseguiu é tão útil quanto dizer que conseguiu.
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
