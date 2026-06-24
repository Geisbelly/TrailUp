import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Trophy, Medal, Crown, Award } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface RankTipo {
  id: number;
  nome: string;
  descricao: string | null;
  criterio: string | null;
}

interface Rank {
  id: number;
  tipo_id: number;
  classe_id: number | null;
  periodo: string | null;
}

interface RankPosicao {
  id: number;
  rank_id: number;
  aluno_id: string;
  aluno_nome: string;
  posicao: number | null;
  pontuacao: number | null;
  medalha: string | null;
}

interface Classe {
  id: number;
  descricao: string | null;
}

export default function RanksSection() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [tipos, setTipos] = useState<RankTipo[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [posicoes, setPosicoes] = useState<RankPosicao[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [isTipoDialogOpen, setIsTipoDialogOpen] = useState(false);
  const [isRankDialogOpen, setIsRankDialogOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<RankTipo | null>(null);
  const [editingRank, setEditingRank] = useState<Rank | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tipoFormData, setTipoFormData] = useState({ nome: "", descricao: "", criterio: "pontuacao" });
  const [rankFormData, setRankFormData] = useState({ tipo_id: "", classe_id: "", periodo: "" });

  const loadData = async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const [{ data: tiposData, error: tiposError }, { data: classesData, error: classesError }] =
        await Promise.all([
          supabase.from("rank_tipo").select("id, nome, descricao, criterio").order("created_at", { ascending: false }),
          supabase.from("classe").select("id, descricao").eq("professor_id", professorId),
        ]);

      if (tiposError) throw tiposError;
      if (classesError) throw classesError;

      const classIds = (classesData ?? []).map((c) => c.id);
      const orClause =
        classIds.length > 0 ? `classe_id.in.(${classIds.join(",")}),classe_id.is.null` : "classe_id.is.null";

      const { data: ranksData, error: ranksError } = await supabase
        .from("ranks")
        .select("id, tipo_id, classe_id, periodo")
        .or(orClause)
        .order("created_at", { ascending: false });

      if (ranksError) throw ranksError;

      setTipos((tiposData as RankTipo[]) ?? []);
      setClasses((classesData as Classe[]) ?? []);
      setRanks((ranksData as Rank[]) ?? []);

      if (ranksData && ranksData.length > 0) {
        setSelectedRank(ranksData[0] as Rank);
      } else {
        setSelectedRank(null);
        setPosicoes([]);
      }
    } catch (error) {
      console.error("Erro ao carregar rankings:", error);
      toast.error("Nao foi possivel carregar rankings.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPosicoes = async (rankId: number) => {
    try {
      const { data, error } = await supabase
        .from("rank_posicoes")
        .select("id, rank_id, aluno_id, posicao, pontuacao, medalha, alunos:aluno_id ( nome )")
        .eq("rank_id", rankId)
        .order("posicao", { ascending: true });

      if (error) throw error;

      const mapped =
        data?.map((p) => ({
          id: p.id,
          rank_id: p.rank_id,
          aluno_id: p.aluno_id,
          posicao: p.posicao,
          pontuacao: p.pontuacao,
          medalha: p.medalha,
          aluno_nome: (p.alunos as { nome: string } | null)?.nome ?? "",
        })) ?? [];

      setPosicoes(mapped);
    } catch (error) {
      console.error("Erro ao carregar posicoes:", error);
      toast.error("Nao foi possivel carregar as posicoes.");
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  useEffect(() => {
    if (selectedRank) {
      loadPosicoes(selectedRank.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRank?.id]);

  const handleSubmitTipo = async () => {
    if (!tipoFormData.nome) {
      toast.error("Preencha o nome do tipo de ranking");
      return;
    }

    setIsSaving(true);
    try {
      if (editingTipo) {
        const { error } = await supabase
          .from("rank_tipo")
          .update({
            nome: tipoFormData.nome,
            descricao: tipoFormData.descricao,
            criterio: tipoFormData.criterio,
          })
          .eq("id", editingTipo.id);

        if (error) throw error;
        toast.success("Tipo de ranking atualizado!");
      } else {
        const { data, error } = await supabase
          .from("rank_tipo")
          .insert({
            nome: tipoFormData.nome,
            descricao: tipoFormData.descricao,
            criterio: tipoFormData.criterio,
          })
          .select("id, nome, descricao, criterio")
          .single();

        if (error) throw error;
        setTipos((prev) => [...prev, data as RankTipo]);
        toast.success("Tipo de ranking criado!");
      }

      await loadData();
      setIsTipoDialogOpen(false);
      setEditingTipo(null);
      setTipoFormData({ nome: "", descricao: "", criterio: "pontuacao" });
    } catch (error) {
      console.error("Erro ao salvar tipo de ranking:", error);
      toast.error("Não foi possível salvar o tipo de ranking.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditTipo = (tipo: RankTipo) => {
    setEditingTipo(tipo);
    setTipoFormData({ nome: tipo.nome, descricao: tipo.descricao || "", criterio: tipo.criterio || "pontuacao" });
    setIsTipoDialogOpen(true);
  };

  const handleDeleteTipo = async (id: number) => {
    try {
      const { error } = await supabase.from("rank_tipo").delete().eq("id", id);
      if (error) throw error;
      setTipos((prev) => prev.filter((t) => t.id !== id));
      toast.success("Tipo de ranking excluido!");
    } catch (error) {
      console.error("Erro ao excluir tipo:", error);
      toast.error("Não foi possível excluir o tipo.");
    }
  };

  const handleSubmitRank = async () => {
    if (!rankFormData.tipo_id || !rankFormData.periodo) {
      toast.error("Preencha o tipo e período");
      return;
    }

    setIsSaving(true);
    try {
      if (editingRank) {
        const { error } = await supabase
          .from("ranks")
          .update({
            tipo_id: parseInt(rankFormData.tipo_id, 10),
            classe_id: rankFormData.classe_id ? parseInt(rankFormData.classe_id, 10) : null,
            periodo: rankFormData.periodo,
          })
          .eq("id", editingRank.id);

        if (error) throw error;
        toast.success("Ranking atualizado!");
      } else {
        const { data, error } = await supabase
          .from("ranks")
          .insert({
            tipo_id: parseInt(rankFormData.tipo_id, 10),
            classe_id: rankFormData.classe_id ? parseInt(rankFormData.classe_id, 10) : null,
            periodo: rankFormData.periodo,
          })
          .select("id, tipo_id, classe_id, periodo")
          .single();

        if (error) throw error;
        setRanks((prev) => [...prev, data as Rank]);
        toast.success("Ranking criado!");
      }

      await loadData();
      setIsRankDialogOpen(false);
      setEditingRank(null);
      setRankFormData({ tipo_id: "", classe_id: "", periodo: "" });
    } catch (error) {
      console.error("Erro ao salvar ranking:", error);
      toast.error("Não foi possível salvar o ranking.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRank = (rank: Rank) => {
    setEditingRank(rank);
    setRankFormData({
      tipo_id: rank.tipo_id.toString(),
      classe_id: rank.classe_id?.toString() || "",
      periodo: rank.periodo || "",
    });
    setIsRankDialogOpen(true);
  };

  const handleDeleteRank = async (id: number) => {
    try {
      const { error } = await supabase.from("ranks").delete().eq("id", id);
      if (error) throw error;
      setRanks((prev) => prev.filter((r) => r.id !== id));
      if (selectedRank?.id === id) {
        setSelectedRank(null);
        setPosicoes([]);
      }
      toast.success("Ranking excluido!");
    } catch (error) {
      console.error("Erro ao excluir ranking:", error);
      toast.error("Não foi possível excluir o ranking.");
    }
  };

  const getTipoName = (tipoId: number) => tipos.find((t) => t.id === tipoId)?.nome || "Desconhecido";
  const getClassName = (classeId: number | null) => {
    if (!classeId) return "Geral";
    return classes.find((c) => c.id === classeId)?.descricao || "Classe não encontrada";
  };

  const getMedalIcon = (medalha: string | null) => {
    switch (medalha) {
      case "ouro":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "prata":
        return <Medal className="h-4 w-4 text-gray-400" />;
      case "bronze":
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return null;
    }
  };

  const rankPosicoes = useMemo(
    () => (selectedRank ? posicoes.filter((p) => p.rank_id === selectedRank.id) : []),
    [posicoes, selectedRank]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerenciamento de Rankings</h2>
        <p className="text-muted-foreground">Configure tipos de ranking e acompanhe as posições dos alunos</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Tipos de Ranking</CardTitle>
            <CardDescription>Configure os críterios de classificacao</CardDescription>
          </div>
          <Dialog
            open={isTipoDialogOpen}
            onOpenChange={(open) => {
              setIsTipoDialogOpen(open);
              if (!open) {
                setEditingTipo(null);
                setTipoFormData({ nome: "", descricao: "", criterio: "pontuacao" });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Tipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTipo ? "Editar" : "Novo"} Tipo de Ranking</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome *</Label>
                  <Input
                    value={tipoFormData.nome}
                    onChange={(e) => setTipoFormData({ ...tipoFormData, nome: e.target.value })}
                    placeholder="Ex: Pontuacao Geral"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={tipoFormData.descricao}
                    onChange={(e) => setTipoFormData({ ...tipoFormData, descricao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Critério</Label>
                  <Select
                    value={tipoFormData.criterio}
                    onValueChange={(v) => setTipoFormData({ ...tipoFormData, criterio: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pontuacao">Pontuação</SelectItem>
                      <SelectItem value="tempo">Tempo</SelectItem>
                      <SelectItem value="acertos">Acertos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSubmitTipo} className="w-full" disabled={isSaving}>
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando tipos...</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {tipos.map((tipo) => (
                <div key={tipo.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{tipo.nome}</p>
                    <p className="text-xs text-muted-foreground capitalize">{tipo.criterio}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEditTipo(tipo)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTipo(tipo.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Rankings Ativos</CardTitle>
              <CardDescription>Clique para ver posições</CardDescription>
            </div>
            <Dialog
              open={isRankDialogOpen}
              onOpenChange={(open) => {
                setIsRankDialogOpen(open);
                if (!open) {
                  setEditingRank(null);
                  setRankFormData({ tipo_id: "", classe_id: "", periodo: "" });
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Ranking
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingRank ? "Editar" : "Novo"} Ranking</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Tipo *</Label>
                    <Select
                      value={rankFormData.tipo_id}
                      onValueChange={(v) => setRankFormData({ ...rankFormData, tipo_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {tipos.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Classe (opcional)</Label>
                    <Select
                      value={rankFormData.classe_id}
                      onValueChange={(v) => setRankFormData({ ...rankFormData, classe_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Geral" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Período *</Label>
                    <Input
                      value={rankFormData.periodo}
                      onChange={(e) => setRankFormData({ ...rankFormData, periodo: e.target.value })}
                      placeholder="Ex: 2025.1"
                    />
                  </div>
                  <Button onClick={handleSubmitRank} className="w-full" disabled={isSaving}>
                    Salvar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando rankings...</p>
            ) : (
              <div className="space-y-2">
                {ranks.map((rank) => (
                  <div
                    key={rank.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedRank?.id === rank.id ? "bg-primary/10 border-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedRank(rank)}
                  >
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">{getTipoName(rank.tipo_id)}</p>
                        <p className="text-xs text-muted-foreground">
                          {getClassName(rank.classe_id)} | {rank.periodo}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditRank(rank);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRank(rank.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              {selectedRank ? `${getTipoName(selectedRank.tipo_id)} - ${selectedRank.periodo}` : "Selecione um ranking"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRank ? (
              rankPosicoes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Aluno</TableHead>
                      <TableHead className="text-right">Pontos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankPosicoes.map((pos) => (
                      <TableRow key={pos.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {getMedalIcon(pos.medalha)}
                            {pos.posicao}
                          </div>
                        </TableCell>
                        <TableCell>{pos.aluno_nome}</TableCell>
                        <TableCell className="text-right font-mono">{pos.pontuacao}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhuma posição registrada</p>
              )
            ) : (
              <p className="text-center text-muted-foreground py-8">Selecione um ranking para ver as posições</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
