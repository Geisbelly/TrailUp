import { PROFILES } from "@/features/signup/brainhex";
import { PROFILE_WORLDS } from "@/lib/design-art";
import { chaveDoPerfil, COR_DO_PERFIL, NOME_DO_PERFIL, nomeExibidoDoPerfil } from "../perfilCores";
import { alunoDaDiversidade } from "../diversidade";
import { useDiversidadeDaTurma } from "../useDiversidadeDaTurma";
import type { Aluno } from "./tipos";

function decimal(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default function AbaPerfil({ aluno }: { aluno: Aluno }) {
  const perfis = [...aluno.perfis].sort((a, b) => b.afinidade - a.afinidade);
  const chaveDominante = chaveDoPerfil(aluno.perfilDominante);
  const mundo = chaveDominante ? PROFILE_WORLDS.find((w) => w.key === chaveDominante) : undefined;
  // Misto pela regra do banco (classe_diversidade_perfis): sem a leitura, o card fica como era.
  const diversidade = useDiversidadeDaTurma(aluno.classe_id);
  const doAluno = alunoDaDiversidade(diversidade, aluno.id);
  const misto =
    doAluno?.misto && doAluno.primeiro && doAluno.segundo && doAluno.margem !== null
      ? { primeiro: doAluno.primeiro, segundo: doAluno.segundo, margem: doAluno.margem }
      : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-[20px] border border-border bg-card px-7 py-[26px]">
        <h3 className="text-lg text-foreground">Afinidade entre os 7 perfis</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Vetor BrainHex do questionário inicial (0–100% por perfil)</p>
        {perfis.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">O aluno ainda não respondeu o questionário BrainHex.</p>
        ) : (
          <ul className="mt-[22px] flex flex-col gap-3.5">
            {perfis.map((perfil) => {
              const chave = chaveDoPerfil(perfil.nome);
              const cor = chave ? COR_DO_PERFIL[chave] : null;
              const dominante = perfil.nome === aluno.perfilDominante;
              return (
                <li key={perfil.nome} className="flex items-center gap-3.5">
                  <div className="flex w-[150px] shrink-0 items-center gap-[9px]">
                    <span
                      aria-hidden="true"
                      className="h-[11px] w-[11px] shrink-0 rounded-full"
                      style={{ background: cor?.marca ?? "hsl(var(--muted-foreground))" }}
                    />
                    <span className="truncate text-[12.5px] font-semibold text-foreground">{nomeExibidoDoPerfil(perfil.nome)}</span>
                    {dominante && <span className="console-label-sm !text-[10px] !text-[hsl(var(--console-violet-text))]">dominante</span>}
                  </div>
                  <div
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--border))]"
                    role="progressbar"
                    aria-label={`Afinidade ${perfil.nome}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(perfil.afinidade)}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, perfil.afinidade))}%`, background: cor?.marca ?? "hsl(var(--muted-foreground))" }}
                    />
                  </div>
                  <span className="w-10 text-right text-[13px] font-bold text-foreground">{Math.round(perfil.afinidade)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col items-center rounded-[20px] border border-border bg-card px-7 py-[26px] text-center">
        <div className="console-eyebrow">{misto ? "Perfil misto" : "Perfil dominante"}</div>
        {misto ? (
          <>
            <div className="my-4 flex items-center justify-center gap-2">
              {[misto.primeiro, misto.segundo].map((chave) => {
                const emblema = PROFILE_WORLDS.find((w) => w.key === chave)?.emblem;
                return emblema ? (
                  <img key={chave} src={emblema} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
                ) : null;
              })}
            </div>
            <h3 className="text-[22px] text-foreground">
              <span style={{ color: COR_DO_PERFIL[misto.primeiro].texto }}>{NOME_DO_PERFIL[misto.primeiro]}</span>
              {" + "}
              <span style={{ color: COR_DO_PERFIL[misto.segundo].texto }}>{NOME_DO_PERFIL[misto.segundo]}</span>
            </h3>
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
              {decimal(misto.margem)} {misto.margem === 1 ? "ponto" : "pontos"} entre os dois
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/90">
              Abaixo de {decimal(diversidade?.margemMisto ?? 10)} pontos, nenhum dos dois perfis fala sozinho pelo aluno.
              Tratar o 1º como o perfil dele esconde o 2º, que pesa quase o mesmo no questionário.
            </p>
          </>
        ) : chaveDominante && mundo ? (
          <>
            <img src={mundo.emblem} alt="" width={72} height={72} className="my-4 h-[72px] w-[72px] object-contain" />
            <h3 className="text-[22px] text-foreground">{NOME_DO_PERFIL[chaveDominante]}</h3>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: COR_DO_PERFIL[chaveDominante].texto }}>
              {mundo.label}
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/90">{PROFILES[chaveDominante].text}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">Guia: {mundo.guide.name}</span>
              <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">{mundo.guide.title}</span>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Sem perfil dominante definido ainda.</p>
        )}
      </div>
    </div>
  );
}
