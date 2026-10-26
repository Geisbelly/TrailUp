import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AuthBrand } from '@/components/auth/AuthScenery';
import { alunoTemCadastro, CONFIRMACAO } from '@/features/signup/cadastroAluno';
import { ETAPAS_INTRODUCAO, etapasConcluidas, urlAppAluno } from '@/features/signup/trilhaIntrodutoria';

export default function Aluno() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [turmas, setTurmas] = useState<number[]>([]);
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [salvando, setSalvando] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const appUrl = urlAppAluno(import.meta.env.VITE_ALUNO_APP_URL);

  const carregar = useCallback(async () => {
    if (!user) return;
    const current = ++generation.current;
    setCarregando(true);
    setErro('');
    try {
      if (!await alunoTemCadastro(user.id)) {
        if (current === generation.current) navigate(CONFIRMACAO, { replace: true });
        return;
      }
      const [progresso, matriculas] = await Promise.all([
        supabase.from('aluno_introducao').select('etapa').eq('aluno_id', user.id),
        supabase.from('classe_aluno').select('classe_id').eq('aluno_id', user.id),
      ]);
      if (progresso.error) throw progresso.error;
      if (matriculas.error) throw matriculas.error;
      if (current !== generation.current) return;
      setConcluidas(etapasConcluidas((progresso.data ?? []).map(p => p.etapa)));
      setTurmas([...new Set((matriculas.data ?? []).map(m => m.classe_id))]);
      setResposta(null);
      setFeedback('');
    } catch {
      if (current === generation.current) setErro('Não foi possível carregar sua trilha. Tente novamente.');
    } finally {
      if (current === generation.current) setCarregando(false);
    }
  }, [user, navigate]);
  useEffect(() => {
    const requests = generation;
    void carregar();
    return () => { requests.current++; };
  }, [carregar]);

  const etapa = ETAPAS_INTRODUCAO.find(e => !concluidas.has(e.id));
  const concluir = async () => {
    if (!etapa || !user || resposta === null || saving.current) return;
    if (resposta !== etapa.correta) {
      setFeedback('Releia a explicação e tente novamente.');
      return;
    }
    saving.current = true;
    setSalvando(true);
    const current = generation.current;
    try {
      // Ignorar conflito permite repetir após resposta de rede perdida, sem UPDATE.
      const { error } = await supabase.from('aluno_introducao')
        .upsert({ aluno_id: user.id, etapa: etapa.id }, { onConflict: 'aluno_id,etapa', ignoreDuplicates: true });
      if (error) throw error;
      if (current !== generation.current) return;
      setConcluidas(previous => new Set([...previous, etapa.id]));
      setResposta(null);
      setFeedback('Etapa concluída e salva.');
    } catch {
      if (current === generation.current) setFeedback('Não foi possível salvar. Sua etapa continua aberta; tente novamente.');
    } finally { saving.current = false; setSalvando(false); }
  };

  return <main className="min-h-screen bg-background text-foreground p-6">
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex justify-between items-center gap-4"><AuthBrand />
        <Button variant="outline" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>Sair</Button>
      </header>
      <h1 className="text-2xl font-bold">Sua jornada começa aqui</h1>
      {carregando ? <p role="status">Carregando sua trilha...</p> : erro ?
        <div role="alert"><p>{erro}</p><Button onClick={carregar}>Tentar novamente</Button></div> : <>
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Trilha introdutória</h2>
          <p>Conheça o TrailUp em três etapas. Você pode começar sem estar em uma turma.</p>
          <Progress className="bg-muted" aria-label="Progresso da introdução" value={concluidas.size / ETAPAS_INTRODUCAO.length * 100} />
          <p>{concluidas.size} de {ETAPAS_INTRODUCAO.length} etapas concluídas</p>
          {etapa ? <section className="space-y-4" aria-label={etapa.titulo}>
            <h3 className="text-lg font-semibold">{etapa.titulo}</h3><p>{etapa.texto}</p>
            <fieldset disabled={salvando} className="space-y-3"><legend className="font-medium mb-2">{etapa.pergunta}</legend>
              {etapa.opcoes.map((opcao, index) => <label key={opcao} className="flex items-center gap-3">
                <input type="radio" name="introducao" checked={resposta === index} onChange={() => setResposta(index)} />{opcao}
              </label>)}
            </fieldset>
            <Button disabled={salvando || resposta === null} onClick={concluir}>{salvando ? 'Salvando...' : 'Concluir etapa'}</Button>
          </section> : <p>Introdução concluída! Você pode continuar nas trilhas da sua turma pelo aplicativo do aluno.</p>}
          <p role="status">{feedback}</p>
        </Card>
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Trilhas da sua turma</h2>
          {turmas.length ? <p>Você tem {turmas.length} {turmas.length === 1 ? 'turma disponível' : 'turmas disponíveis'}. Abra o aplicativo do aluno e escolha a turma para ver os tópicos.</p> :
            <p>Você ainda não está em uma turma. Peça ao professor para incluir sua conta usando o e-mail do cadastro. Enquanto isso, sua trilha introdutória está disponível acima.</p>}
          <Button variant="outline" onClick={carregar} disabled={salvando}>Atualizar turmas e progresso</Button>{' '}
          {appUrl && <Button asChild><a href={appUrl} rel="noreferrer">Abrir aplicativo do aluno</a></Button>}{' '}
          <Button asChild variant="outline"><Link to="/download">Instalar aplicativo do aluno</Link></Button>
          <p className="text-sm text-muted-foreground">No aplicativo, entre com o mesmo e-mail e senha usados neste cadastro.</p>
        </Card>
      </>}
    </div>
  </main>;
}
