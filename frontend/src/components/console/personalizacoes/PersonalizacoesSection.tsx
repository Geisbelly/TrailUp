import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, Palette, UserSearch, FileText, Music, FileImage, NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchContextoDocente,
  fetchPersonalizacaoPorPerfil,
  type PersonalizacaoContextoDocenteResponse,
  type PersonalizacaoPerfilItem,
  type PersonalizacaoPorPerfilResponse,
} from "./personalizacoesApi";

type ClasseRow = { id: number; descricao: string | null };
type TopicoRow = { id: number; classe_id: number; nome: string | null; ordem: number | null };
type AlunoRow = { id: string; nome: string | null; email: string | null; perfil_dominante: string };

const MATERIAL_TIPOS: Array<{ key: string; label: string; icon: typeof FileText }> = [
  { key: "markdown", label: "Texto", icon: NotebookPen },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "audio", label: "Áudio", icon: Music },
  { key: "apresentacao", label: "Apresentação", icon: FileImage },
];

function getMaterial(materiais: Record<string, unknown> | null | undefined, tipo: string): Record<string, unknown> | null {
  if (!materiais || typeof materiais !== "object") return null;
  const value = (materiais as Record<string, unknown>)[tipo];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function materialUrl(material: Record<string, unknown> | null): string | null {
  if (!material) return null;
  const url = material.arquivo_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function planoText(plano: PersonalizacaoPerfilItem["plano"], key: string): string {
  if (!plano || typeof plano !== "object") return "";
  const value = (plano as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export default function PersonalizacoesSection({ professorId }: { professorId?: string }) {
  const { user, session } = useAuth();
  const resolvedProfessorId = professorId ?? user?.id;

  const [classes, setClasses] = useState<ClasseRow[]>([]);
  const [topicos, setTopicos] = useState<TopicoRow[]>([]);
  const [alunos, setAlunos] = useState<AlunoRow[]>([]);
  const [classeId, setClasseId] = useState<string>("");
  const [topicoId, setTopicoId] = useState<string>("");
  const [alunoId, setAlunoId] = useState<string>("");

  const [porPerfil, setPorPerfil] = useState<PersonalizacaoPorPerfilResponse | null>(null);
  const [porPerfilLoading, setPorPerfilLoading] = useState(false);
  const [porPerfilError, setPorPerfilError] = useState<string | null>(null);

  const [contextoAluno, setContextoAluno] = useState<PersonalizacaoContextoDocenteResponse | null>(null);
  const [contextoLoading, setContextoLoading] = useState(false);
  const [contextoError, setContextoError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const seed = String(session?.access_token ?? "").trim();
    if (seed) return seed;
    const { data } = await supabase.auth.getSession();
    return String(data.session?.access_token ?? "").trim();
  }, [session?.access_token]);

  // Carrega classes do professor
  useEffect(() => {
    if (!resolvedProfessorId) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("classe")
        .select("id, descricao")
        .eq("professor_id", resolvedProfessorId)
        .order("created_at", { ascending: false });
      if (!active) return;
      const rows = (data ?? []) as ClasseRow[];
      setClasses(rows);
      if (rows.length > 0) setClasseId((prev) => prev || String(rows[0].id));
    })();
    return () => {
      active = false;
    };
  }, [resolvedProfessorId]);

  // Carrega topicos e alunos da classe selecionada
  useEffect(() => {
    const numericClasse = Number(classeId);
    if (!Number.isFinite(numericClasse) || numericClasse <= 0) {
      setTopicos([]);
      setAlunos([]);
      return;
    }
    let active = true;
    void (async () => {
      const [{ data: topicosData }, { data: classeAlunoData }] = await Promise.all([
        supabase
          .from("topicos")
          .select("id, classe_id, nome, ordem")
          .eq("classe_id", numericClasse)
          .order("ordem", { ascending: true }),
        supabase.from("classe_aluno").select("aluno_id").eq("classe_id", numericClasse),
      ]);
      if (!active) return;
      const topicoRows = (topicosData ?? []) as TopicoRow[];
      setTopicos(topicoRows);
      setTopicoId((prev) => prev || (topicoRows.length > 0 ? String(topicoRows[0].id) : ""));

      const alunoIds = Array.from(
        new Set(((classeAlunoData ?? []) as Array<{ aluno_id: string | null }>).map((r) => r.aluno_id).filter(Boolean))
      ) as string[];

      if (alunoIds.length === 0) {
        setAlunos([]);
        return;
      }

      const [{ data: alunosData }, { data: perfilData }] = await Promise.all([
        supabase.from("alunos").select("id, nome, email").in("id", alunoIds),
        supabase.from("aluno_perfil").select("aluno_id, afinidade, perfil:perfil_id ( nome )").in("aluno_id", alunoIds),
      ]);
      if (!active) return;

      type PerfilRow = { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null };
      const dominanteMap = new Map<string, { nome: string; afinidade: number }>();
      ((perfilData as PerfilRow[]) ?? []).forEach((p) => {
        if (!p.aluno_id) return;
        const current = dominanteMap.get(p.aluno_id);
        const afinidade = Number(p.afinidade ?? 0);
        if (!current || afinidade > current.afinidade) {
          dominanteMap.set(p.aluno_id, { nome: p.perfil?.nome || "mastermind", afinidade });
        }
      });

      const alunoRows: AlunoRow[] = ((alunosData ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map(
        (a) => ({
          id: a.id,
          nome: a.nome,
          email: a.email,
          perfil_dominante: (dominanteMap.get(a.id)?.nome || "mastermind").toLowerCase(),
        })
      );
      setAlunos(alunoRows);
      setAlunoId((prev) => prev || (alunoRows.length > 0 ? alunoRows[0].id : ""));
    })();
    return () => {
      active = false;
    };
  }, [classeId]);

  // Busca personalizacao por perfil (visoes 1 e 2)
  const loadPorPerfil = useCallback(async () => {
    const numericClasse = Number(classeId);
    const numericTopico = Number(topicoId);
    if (!Number.isFinite(numericClasse) || !Number.isFinite(numericTopico) || numericTopico <= 0) {
      setPorPerfil(null);
      return;
    }
    setPorPerfilLoading(true);
    setPorPerfilError(null);
    try {
      const token = await resolveToken();
      const data = await fetchPersonalizacaoPorPerfil(token, { classeId: numericClasse, topicoId: numericTopico });
      setPorPerfil(data);
    } catch (error) {
      setPorPerfil(null);
      setPorPerfilError(error instanceof Error ? error.message : "Falha ao carregar personalizações por perfil.");
    } finally {
      setPorPerfilLoading(false);
    }
  }, [classeId, topicoId, resolveToken]);

  useEffect(() => {
    void loadPorPerfil();
  }, [loadPorPerfil]);

  // Busca contexto do aluno (visao 3)
  const loadContexto = useCallback(async () => {
    const numericClasse = Number(classeId);
    if (!alunoId || !Number.isFinite(numericClasse) || numericClasse <= 0) {
      setContextoAluno(null);
      return;
    }
    setContextoLoading(true);
    setContextoError(null);
    try {
      const token = await resolveToken();
      const numericTopico = Number(topicoId);
      const data = await fetchContextoDocente(token, {
        alunoId,
        classeId: numericClasse,
        topicoId: Number.isFinite(numericTopico) && numericTopico > 0 ? numericTopico : undefined,
      });
      setContextoAluno(data);
    } catch (error) {
      setContextoAluno(null);
      setContextoError(error instanceof Error ? error.message : "Falha ao carregar contexto do aluno.");
    } finally {
      setContextoLoading(false);
    }
  }, [alunoId, classeId, topicoId, resolveToken]);

  useEffect(() => {
    void loadContexto();
  }, [loadContexto]);

  const alunoSelecionado = useMemo(() => alunos.find((a) => a.id === alunoId) ?? null, [alunos, alunoId]);

  const perfilDoAluno = useMemo(() => {
    if (!alunoSelecionado || !porPerfil) return null;
    const key = alunoSelecionado.perfil_dominante;
    return porPerfil.perfis.find((p) => p.perfil === key) ?? null;
  }, [alunoSelecionado, porPerfil]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Personalizações</h2>
        <p className="text-muted-foreground">
          Compare como o material fica para cada perfil BrainHex e visualize a personalização efetiva por aluno.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Classe</p>
            <Select value={classeId} onValueChange={setClasseId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecione a classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.descricao || `Classe ${c.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Tópico</p>
            <Select value={topicoId} onValueChange={setTopicoId} disabled={topicos.length === 0}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecione o tópico" />
              </SelectTrigger>
              <SelectContent>
                {topicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nome || `Tópico ${t.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPorPerfil()} disabled={porPerfilLoading}>
            {porPerfilLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="por-perfil" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-perfil">
            <Layers className="h-4 w-4 mr-2" />
            Por perfil
          </TabsTrigger>
          <TabsTrigger value="estrutura">
            <Palette className="h-4 w-4 mr-2" />
            Estrutura e paleta
          </TabsTrigger>
          <TabsTrigger value="por-aluno">
            <UserSearch className="h-4 w-4 mr-2" />
            Por aluno
          </TabsTrigger>
        </TabsList>

        {/* Visao 1: material lado a lado pelos 7 perfis */}
        <TabsContent value="por-perfil" className="space-y-4">
          {porPerfilError ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">{porPerfilError}</CardContent>
            </Card>
          ) : porPerfilLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando personalizações...
              </CardContent>
            </Card>
          ) : !porPerfil ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione uma classe e um tópico para comparar os perfis.
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {porPerfil.total_perfis_com_material} de 7 perfis com material gerado para este tópico.
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {porPerfil.perfis.map((item) => (
                  <PerfilMaterialCard key={item.perfil} item={item} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* Visao 2: plano (estrutura de apresentacao) + design tokens */}
        <TabsContent value="estrutura" className="space-y-4">
          {!porPerfil ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione uma classe e um tópico para ver a estrutura de apresentação por perfil.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {porPerfil.perfis.map((item) => (
                <PerfilEstruturaCard key={item.perfil} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Visao 3: preview por aluno reutilizando o contexto docente */}
        <TabsContent value="por-aluno" className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Aluno</p>
                <Select value={alunoId} onValueChange={setAlunoId} disabled={alunos.length === 0}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Selecione o aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {alunos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome || a.email || a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {contextoError ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">{contextoError}</CardContent>
            </Card>
          ) : contextoLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando contexto do aluno...
              </CardContent>
            </Card>
          ) : !alunoSelecionado ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione um aluno para ver a personalização efetiva dele.
              </CardContent>
            </Card>
          ) : (
            <AlunoPreview
              aluno={alunoSelecionado}
              contexto={contextoAluno}
              perfilDoAluno={perfilDoAluno}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaletaPreview({ item }: { item: PersonalizacaoPerfilItem }) {
  const cores = item.design_tokens?.cores;
  if (!cores) return null;
  const swatches: Array<{ label: string; value: string }> = [
    { label: "Fundo", value: cores.background },
    { label: "Superfície", value: cores.surface },
    { label: "Primária", value: cores.primary },
    { label: "Borda", value: cores.border },
    { label: "Texto", value: cores.text_primary },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {swatches.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <div
            className="h-8 w-8 rounded-md border"
            style={{ backgroundColor: s.value }}
            title={`${s.label}: ${s.value}`}
          />
          <span className="text-[10px] text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function PerfilMaterialCard({ item }: { item: PersonalizacaoPerfilItem }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: item.cor }} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base capitalize">{item.perfil_label}</CardTitle>
          <Badge variant={item.tem_personalizacao ? "default" : "outline"}>
            {item.tem_personalizacao ? "Gerado" : "Sem material"}
          </Badge>
        </div>
        <CardDescription className="capitalize">
          {item.perfil} · {item.total_alunos} aluno(s) com este perfil
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.tem_personalizacao ? (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato prioritário</p>
              <p className="font-medium capitalize">{item.formato_prioritario || "misto"}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Materiais</p>
              <div className="flex flex-col gap-1">
                {MATERIAL_TIPOS.map(({ key, label, icon: Icon }) => {
                  const material = getMaterial(item.materiais, key);
                  const url = materialUrl(material);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          abrir
                        </a>
                      ) : material ? (
                        <span className="text-xs text-muted-foreground">processando</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ainda não há personalização gerada para este perfil neste tópico.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PerfilEstruturaCard({ item }: { item: PersonalizacaoPerfilItem }) {
  const formatos = item.formatos_gerados ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: item.cor }} />
      <CardHeader className="pb-3">
        <CardTitle className="text-base capitalize">{item.perfil_label}</CardTitle>
        <CardDescription className="capitalize">{item.perfil}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tom</p>
            <p className="font-medium">{planoText(item.plano, "tom") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estilo</p>
            <p className="font-medium">{planoText(item.plano, "estilo") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nível</p>
            <p className="font-medium">{planoText(item.plano, "nivel") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Prioritário</p>
            <p className="font-medium capitalize">{item.formato_prioritario || "—"}</p>
          </div>
        </div>
        {formatos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {formatos.map((f) => (
              <Badge key={f} variant="secondary" className="capitalize">
                {f}
              </Badge>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paleta (design tokens)</p>
          <PaletaPreview item={item} />
        </div>
      </CardContent>
    </Card>
  );
}

function AlunoPreview({
  aluno,
  contexto,
  perfilDoAluno,
}: {
  aluno: AlunoRow;
  contexto: PersonalizacaoContextoDocenteResponse | null;
  perfilDoAluno: PersonalizacaoPerfilItem | null;
}) {
  const personalizacoes = contexto?.personalizacoes ?? [];
  const efetiva = personalizacoes[0] ?? null;
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {perfilDoAluno && <div className="h-1.5 w-full" style={{ backgroundColor: perfilDoAluno.cor }} />}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {aluno.nome || aluno.email || aluno.id}
            <Badge variant="secondary" className="capitalize">
              {perfilDoAluno?.perfil_label || aluno.perfil_dominante}
            </Badge>
          </CardTitle>
          <CardDescription>Perfil dominante e personalização efetiva entregue ao aluno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {perfilDoAluno && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Paleta aplicada ({perfilDoAluno.perfil})
              </p>
              <PaletaPreview item={perfilDoAluno} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personalização efetiva</CardTitle>
          <CardDescription>Materiais e plano da personalização mais recente do aluno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!efetiva ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma personalização encontrada para este aluno{contexto ? " nesta classe" : ""}.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {efetiva.formato_prioritario || "misto"}
                </Badge>
                {(efetiva.formatos_gerados ?? []).map((f) => (
                  <Badge key={f} variant="secondary" className="capitalize">
                    {f}
                  </Badge>
                ))}
              </div>
              {efetiva.plano?.justificativa && (
                <p className="text-sm text-muted-foreground">{efetiva.plano.justificativa}</p>
              )}
              <div className="flex flex-col gap-1">
                {MATERIAL_TIPOS.map(({ key, label, icon: Icon }) => {
                  const material = getMaterial(efetiva.materiais, key);
                  const url = materialUrl(material);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          abrir
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Etapas geradas: {efetiva.steps?.length ?? 0}
                {efetiva.gerado_em ? ` · gerado em ${new Date(efetiva.gerado_em).toLocaleString("pt-BR")}` : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
