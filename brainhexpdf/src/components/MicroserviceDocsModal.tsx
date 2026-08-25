import React, { useState, useEffect } from 'react';
import {
  Server,
  Code2,
  Terminal,
  Copy,
  Check,
  Zap,
  Play,
  FileJson,
  Layers,
  Database,
  ExternalLink,
  ShieldCheck,
  Cpu,
  RefreshCw,
  X,
  BookOpen,
} from 'lucide-react';
import { BRAIN_HEX_PROFILES, BRAIN_HEX_GUIDE_NAMES } from '../data/brainHexProfiles';
import { BrainHexType } from '../types';

interface MicroserviceDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MicroserviceDocsModal: React.FC<MicroserviceDocsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'endpoints' | 'tester' | 'snippets' | 'openapi'>('endpoints');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('generate');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live Tester State
  const [testEndpoint, setTestEndpoint] = useState<string>('/api/v1/health');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST'>('GET');
  const [testBody, setTestBody] = useState<string>(
    JSON.stringify(
      {
        topic: 'Arquitetura de Microsserviços e Eventos',
        targetProfile: 'mastermind',
        slideCount: 8,
        classe: 'Turma-Engenharia-2026',
        autoSaveSupabase: false,
      },
      null,
      2
    )
  );
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResponse, setTestResponse] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [testDuration, setTestDuration] = useState<number | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunTest = async () => {
    setTestLoading(true);
    setTestResponse(null);
    setTestStatus(null);
    const start = Date.now();

    try {
      const options: RequestInit = {
        method: testMethod,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (testMethod === 'POST') {
        options.body = testBody;
      }

      const res = await fetch(testEndpoint, options);
      const duration = Date.now() - start;
      setTestDuration(duration);
      setTestStatus(res.status);

      const data = await res.json();
      setTestResponse(data);
    } catch (err: any) {
      setTestDuration(Date.now() - start);
      setTestResponse({ error: err.message || 'Erro de rede na requisição' });
      setTestStatus(500);
    } finally {
      setTestLoading(false);
    }
  };

  const pythonSnippet = `# Microserviço TrailUp BrainHex - Integração Python (requests / httpx)
import requests
import json

BASE_URL = "${baseUrl}/api/v1"

# 1. Obter Guardiões e Perfis Cognitivos
profiles_res = requests.get(f"{BASE_URL}/profiles")
profiles = profiles_res.json()
print(f"Perfis disponíveis: {len(profiles.get('profiles', []))}")

# 2. Gerar Slides Pedagógicos Divididos por Assunto com Narrativa Temática
payload = {
    "topic": "Arquitetura de Microsserviços e Event-Driven Design",
    "targetProfile": "mastermind",  # Idris - O Sábio das Constelações
    "slideCount": 8,
    "classe": "Turma-Engenharia-2026",
    "autoSaveSupabase": False,  # Salva o deck no bucket do Supabase
}

response = requests.post(f"{BASE_URL}/generate", json=payload, timeout=90)
data = response.json()

if data.get("success"):
    deck = data["deck"]
    print(f"Deck gerado: {deck['title']} ({len(deck['slides'])} slides)")
    print(f"Guia Narrador: {data['characterGuide']['name']} - {data['characterGuide']['title']}")
    
    # Cada slide cobre um assunto específico com narrativa e analogias temáticas
    for i, slide in enumerate(deck["slides"]):
        print(f"Slide {i+1} [{slide.get('subtopic')}]: {slide['title']}")
else:
    print(f"Erro na geração: {data.get('error')}")
`;

  const nodeSnippet = `// Microserviço TrailUp BrainHex - Integração Node.js / TypeScript
import axios from 'axios';

const BASE_URL = '${baseUrl}/api/v1';

async function generateBrainHexDeck() {
  try {
    // 1. Health Check
    const health = await axios.get(\`\${BASE_URL}/health\`);
    console.log('Status do Microserviço:', health.data.status);

    // 2. Geração de Slides Divididos por Assunto
    const response = await axios.post(\`\${BASE_URL}/generate\`, {
      topic: 'Estruturas de Dados e Algoritmos Avançados',
      targetProfile: 'achiever', // Kwame - O Cavaleiro Solar
      slideCount: 8,
      classe: 'Ciencia-da-Computacao-2026',
      autoSaveSupabase: false,
    });

    const { deck, characterGuide } = response.data;
    console.log(\`Deck criado: \${deck.title} com o Guia \${characterGuide.name}\`);
    console.log(\`Total de slides gerados: \${deck.slides.length}\`);
    return deck;
  } catch (error) {
    console.error('Falha no microserviço:', error);
  }
}

generateBrainHexDeck();
`;

  const curlSnippet = `# 1. Health Check
curl -X GET ${baseUrl}/api/v1/health

# 2. Listar Guardiões e Perfis
curl -X GET ${baseUrl}/api/v1/profiles

# 3. Gerar Apresentação Pedagógica
curl -X POST ${baseUrl}/api/v1/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "topic": "Fundamentos de Cloud Computing e Kubernetes",
    "targetProfile": "mastermind",
    "slideCount": 8,
    "classe": "Engenharia-2026"
  }'

# 4. Pré-visualizar Prompt Pedagógico sem gastar tokens
curl -X POST ${baseUrl}/api/v1/prompt-preview \\
  -H "Content-Type: application/json" \\
  -d '{
    "topic": "Machine Learning",
    "targetProfile": "seeker",
    "slideCount": 8
  }'
`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-stone-900 border border-amber-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-stone-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-stone-950 shadow-lg shadow-amber-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-amber-300">
                  Microserviço RESTful TrailUp BrainHex
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  v1.3.0 · Ativo
                </span>
              </div>
              <p className="text-xs text-stone-400">
                API RESTful de geração cognitiva, roteirização pedagógica e sincronização Supabase
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-stone-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-stone-800 bg-stone-950/40">
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'endpoints'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Endpoints & Arquitetura
          </button>

          <button
            onClick={() => setActiveTab('tester')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'tester'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Play className="w-4 h-4" />
            Testador Live de API
          </button>

          <button
            onClick={() => setActiveTab('snippets')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'snippets'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Código de Integração (Python / Node / cURL)
          </button>

          <button
            onClick={() => setActiveTab('openapi')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'openapi'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileJson className="w-4 h-4" />
            OpenAPI 3.0 (Swagger Spec)
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ENDPOINTS */}
          {activeTab === 'endpoints' && (
            <div className="space-y-6">
              {/* Microservice Overview Badge */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                    <Zap className="w-4 h-4" />
                    Alta Disponibilidade
                  </div>
                  <p className="text-sm font-semibold text-stone-200">
                    Failover Multichave & Rotação
                  </p>
                  <p className="text-xs text-stone-400">
                    Suporta até 8 chaves com alternância automática entre modelos em 503/429
                  </p>
                </div>

                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                    <Database className="w-4 h-4" />
                    Armazenamento Supabase
                  </div>
                  <p className="text-sm font-semibold text-stone-200">
                    Bucket <code className="text-amber-300">conteudo_aluno</code>
                  </p>
                  <p className="text-xs text-stone-400">
                    Organização automática por <code className="text-stone-300">&#123;perfil&#125;/&#123;topico&#125;/&#123;classe&#125;/</code>
                  </p>
                </div>

                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4" />
                    CORS & Multimodal
                  </div>
                  <p className="text-sm font-semibold text-stone-200">
                    Consumo Cross-Origin Livre
                  </p>
                  <p className="text-xs text-stone-400">
                    Compatível com Python, Django, FastAPI, React, Flutter e microsserviços externos
                  </p>
                </div>
              </div>

              {/* Endpoints List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  Catálogo de Endpoints RESTful v1
                </h3>

                {/* POST /api/v1/generate */}
                <div className="p-4 bg-stone-950/80 border border-amber-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-black bg-amber-500 text-stone-950 rounded-md">
                        POST
                      </span>
                      <code className="text-sm font-bold text-amber-200">/api/v1/generate</code>
                    </div>
                    <span className="text-xs text-stone-400 font-mono">Retorna JSON Completo</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Gera a apresentação de slides dividindo cada slide para um assunto/subtópico do conteúdo, com narrativa imersiva centrada na temática e no perfil BrainHex (Idris, Kwame, Amara, Kenji, Amina, Mateo & Zuri, Ember), incluindo parágrafos densos, exemplos práticos, analogias e quiz formativo.
                  </p>
                  <div className="p-3 bg-stone-900 rounded-lg text-xs font-mono text-stone-300 border border-stone-800 space-y-1">
                    <div className="text-stone-400 font-semibold">// Payload Exemplo:</div>
                    <pre className="text-amber-300/90 whitespace-pre-wrap">
{`{
  "topic": "Arquitetura Orientada a Eventos",
  "targetProfile": "mastermind",
  "slideCount": 8,
  "classe": "Engenharia-2026",
  "autoSaveSupabase": false
}`}
                    </pre>
                  </div>
                </div>

                {/* GET /api/v1/profiles */}
                <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-black bg-blue-500 text-white rounded-md">
                        GET
                      </span>
                      <code className="text-sm font-bold text-blue-200">/api/v1/profiles</code>
                    </div>
                    <span className="text-xs text-stone-400 font-mono">7 Guardiões</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Retorna o catálogo completo dos 7 Guardiões BrainHex com seus nomes oficiais, títulos, traços de personalidade, histórias e diretrizes cognitivas de aprendizagem.
                  </p>
                </div>

                {/* GET /api/v1/health */}
                <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-black bg-emerald-500 text-stone-950 rounded-md">
                        GET
                      </span>
                      <code className="text-sm font-bold text-emerald-200">/api/v1/health</code>
                      <span className="text-xs text-stone-500 font-mono">(ou /health)</span>
                    </div>
                    <span className="text-xs text-stone-400 font-mono">Liveness / Readiness</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Retorna o estado de saúde do microserviço, uptime, uso de memória (RSS/Heap), quantidade de chaves de API disponíveis no pool e modelos ativos.
                  </p>
                </div>

                {/* POST /api/v1/prompt-preview */}
                <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-black bg-purple-500 text-white rounded-md">
                        POST
                      </span>
                      <code className="text-sm font-bold text-purple-200">/api/v1/prompt-preview</code>
                    </div>
                    <span className="text-xs text-stone-400 font-mono">Zero Consumo de Tokens</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Compila e retorna os prompts de sistema e usuário construídos para o perfil, permitindo auditoria pedagógica ou testes sem invocar a IA.
                  </p>
                </div>

                {/* POST /api/v1/supabase/sync */}
                <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-black bg-cyan-500 text-stone-950 rounded-md">
                        POST
                      </span>
                      <code className="text-sm font-bold text-cyan-200">/api/v1/supabase/sync</code>
                    </div>
                    <span className="text-xs text-stone-400 font-mono">Storage Persistence</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Salva diretamente o deck de slides em JSON e metadados no bucket do Supabase configurado.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE TESTER */}
          {activeTab === 'tester' && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400 font-bold">Método:</label>
                    <select
                      value={testMethod}
                      onChange={(e) => {
                        const m = e.target.value as 'GET' | 'POST';
                        setTestMethod(m);
                        if (m === 'GET') {
                          setTestEndpoint('/api/v1/health');
                        } else {
                          setTestEndpoint('/api/v1/prompt-preview');
                        }
                      }}
                      className="px-3 py-1.5 text-xs bg-stone-900 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-amber-400"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>

                  <div className="flex-1 min-w-[200px] flex items-center gap-2">
                    <label className="text-xs text-stone-400 font-bold">Endpoint:</label>
                    <select
                      value={testEndpoint}
                      onChange={(e) => {
                        const ep = e.target.value;
                        setTestEndpoint(ep);
                        if (ep.startsWith('/api/v1/health') || ep.startsWith('/api/v1/profiles') || ep === '/openapi.json') {
                          setTestMethod('GET');
                        } else {
                          setTestMethod('POST');
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-stone-900 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-amber-400"
                    >
                      <option value="/api/v1/health">GET /api/v1/health (Liveness)</option>
                      <option value="/api/v1/profiles">GET /api/v1/profiles (Todos os Guardiões)</option>
                      <option value="/api/v1/profiles/mastermind">GET /api/v1/profiles/mastermind (Idris)</option>
                      <option value="/api/v1/profiles/achiever">GET /api/v1/profiles/achiever (Kwame)</option>
                      <option value="/api/v1/profiles/seeker">GET /api/v1/profiles/seeker (Amara)</option>
                      <option value="/api/v1/profiles/survivor">GET /api/v1/profiles/survivor (Kenji)</option>
                      <option value="/api/v1/profiles/conqueror">GET /api/v1/profiles/conqueror (Amina)</option>
                      <option value="/api/v1/profiles/socializer">GET /api/v1/profiles/socializer (Mateo & Zuri)</option>
                      <option value="/api/v1/profiles/daredevil">GET /api/v1/profiles/daredevil (Ember)</option>
                      <option value="/api/v1/prompt-preview">POST /api/v1/prompt-preview (Preview Rápido de Prompt)</option>
                      <option value="/api/v1/generate">POST /api/v1/generate (Geração Completa com IA)</option>
                      <option value="/openapi.json">GET /openapi.json (OpenAPI Spec)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleRunTest}
                    disabled={testLoading}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Executando...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Executar Requisição
                      </>
                    )}
                  </button>
                </div>

                {/* Request Body Editor for POST */}
                {testMethod === 'POST' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400">Request Body (JSON):</label>
                    <textarea
                      value={testBody}
                      onChange={(e) => setTestBody(e.target.value)}
                      rows={6}
                      className="w-full p-3 text-xs font-mono bg-stone-900 border border-stone-800 rounded-lg text-amber-200/90 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}
              </div>

              {/* Response Viewer */}
              {testResponse && (
                <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-stone-300">Resposta da API:</span>
                      {testStatus && (
                        <span
                          className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                            testStatus >= 200 && testStatus < 300
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          Status {testStatus}
                        </span>
                      )}
                      {testDuration !== null && (
                        <span className="text-xs text-stone-400 font-mono">
                          Tempo: {testDuration}ms
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => copyToClipboard(JSON.stringify(testResponse, null, 2), 'response')}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors"
                    >
                      {copiedKey === 'response' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar JSON
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-3 bg-stone-900/90 rounded-lg text-xs font-mono text-emerald-300/90 max-h-80 overflow-y-auto border border-stone-800/80 whitespace-pre-wrap">
                    {JSON.stringify(testResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CODE SNIPPETS */}
          {activeTab === 'snippets' && (
            <div className="space-y-6">
              {/* Python Snippet */}
              <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                      Integração Python (requests / microserviço personalizacao.py)
                    </h4>
                  </div>
                  <button
                    onClick={() => copyToClipboard(pythonSnippet, 'python')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors"
                  >
                    {copiedKey === 'python' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Python
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-900 rounded-lg text-xs font-mono text-stone-300 border border-stone-800 overflow-x-auto whitespace-pre-wrap">
                  {pythonSnippet}
                </pre>
              </div>

              {/* cURL Snippet */}
              <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                      Comandos cURL (Terminal / Bash)
                    </h4>
                  </div>
                  <button
                    onClick={() => copyToClipboard(curlSnippet, 'curl')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors"
                  >
                    {copiedKey === 'curl' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar cURL
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-900 rounded-lg text-xs font-mono text-amber-300/90 border border-stone-800 overflow-x-auto whitespace-pre-wrap">
                  {curlSnippet}
                </pre>
              </div>

              {/* Node.js Snippet */}
              <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                      Integração Node.js / TypeScript (axios / fetch)
                    </h4>
                  </div>
                  <button
                    onClick={() => copyToClipboard(nodeSnippet, 'node')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors"
                  >
                    {copiedKey === 'node' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Node.js
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-stone-900 rounded-lg text-xs font-mono text-blue-200/90 border border-stone-800 overflow-x-auto whitespace-pre-wrap">
                  {nodeSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: OPENAPI 3.0 */}
          {activeTab === 'openapi' && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-stone-200">
                    Especificação OpenAPI 3.0.3 (Swagger)
                  </h4>
                  <p className="text-xs text-stone-400">
                    Disponível ao vivo em <code className="text-amber-300">{baseUrl}/openapi.json</code>
                  </p>
                </div>

                <a
                  href="/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir openapi.json
                </a>
              </div>

              <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-2">
                <div className="text-xs text-stone-400 font-bold uppercase tracking-wider">
                  Visualização do Esquema OpenAPI:
                </div>
                <pre className="p-3 bg-stone-900 rounded-lg text-xs font-mono text-stone-300 max-h-96 overflow-y-auto border border-stone-800 whitespace-pre-wrap">
{`{
  "openapi": "3.0.3",
  "info": {
    "title": "TrailUp BrainHex Generation Microservice API",
    "version": "1.3.0",
    "description": "Microserviço RESTful para geração de apresentações pedagógicas adaptadas aos 7 perfis BrainHex..."
  },
  "paths": {
    "/health": { "get": { "summary": "Health check probe" } },
    "/profiles": { "get": { "summary": "List all 7 BrainHex Guide Personas" } },
    "/profiles/{profileId}": { "get": { "summary": "Get single profile info" } },
    "/generate": { "post": { "summary": "Generate pedagogical BrainHex presentation deck" } },
    "/prompt-preview": { "post": { "summary": "Preview compiled prompt without AI token cost" } },
    "/supabase/sync": { "post": { "summary": "Direct sync to Supabase storage" } }
  }
}`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-800 bg-stone-950 text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>Porta 3000 · Protocolo HTTP/1.1 & HTTP/2 · JSON UTF-8</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
