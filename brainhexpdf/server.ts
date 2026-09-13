import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateInteractiveHtml } from './src/utils/deckExportUtils';

import { checkSupabaseSecretGuard } from './src/security/checkSupabaseSecretGuard';
import { validateRenderAndStoreInput } from './src/services/renderAndStoreValidation';

import { BRAIN_HEX_PROFILES } from './src/data/brainHexProfiles';
import { enrichDeckWithInteractiveElements } from './src/utils/interactiveElementGenerator';
import { enrichDeckWithVisualReferences } from './src/utils/visualReferenceAnalyzer';
import {
  extractGeneratedImagesBySubtopic,
  resolveSlideIllustrations,
  type ImageAttachment,
  type GeneratedImage,
} from './src/utils/slideIllustrations';
import {
  ImageGenerationUnavailableError,
  isImageGenerationUnavailableError,
} from './src/utils/imageGenerationErrors';
import { insertReflectionCheckpoints } from './src/utils/reflectionCheckpoints';
import { extractFinalReflectionIntoOwnSlide } from './src/utils/finalReflectionSlide';
import { paginateSlidesByDensity } from './src/utils/slidePagination';
import {
  DEFAULT_SLIDES_PER_BATCH,
  describeGenerationFailure,
  isTruncationFailure,
  planSlideBatches,
  splitBatch,
  type SlideBatch,
} from './src/utils/slideBatchPlanner';
import { canSendAsGeminiInlineData } from './src/utils/geminiInlineImageMimes';
import { sanitizeQuizContent, shuffleQuizOptions } from './src/utils/quizSanitize';
import { persistApresentacaoResult, type SupabaseClientLike } from './src/services/materialsPersistence';


dotenv.config();

const app = express();
// Default 3002 - NAO usar 3000 (porta do microservice/api-brainhex no mesmo
// host de dev). O export do AI Studio hardcoda 3000; restaurado aqui.
const PORT = Number(process.env.PORT) || 3002;
const SERVICE_VERSION = '1.3.0';

// HARD-FAIL (decisão de segurança de 2026-08-17, ver
// checkSupabaseSecretGuard.ts): recusa subir o servidor se
// SUPABASE_SERVICE_ROLE_KEY estiver configurada sem API_SHARED_SECRET —
// sem o segredo, /api/v1/render-and-store vira escrita arbitrária não
// autenticada no Storage via service role key.
try {
  checkSupabaseSecretGuard(process.env);
} catch (error: any) {
  console.error(error.message);
  process.exit(1);
}
const SERVICE_START_TIME = new Date();

// Microservice Middleware: CORS for cross-service API consumption (Python, Node, Web, Mobile)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-supabase-url, x-supabase-anon-key, x-client-version'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// JSON body parser with 50mb limit for multimodal payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Microservice Request Logger
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/openapi.json') {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[TrailUp Microservice] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

// Segredo compartilhado com o microservice do trailup. Opt-in: se
// API_SHARED_SECRET não estiver definido, o middleware deixa passar tudo
// (mesmo comportamento do microservice/api-brainhex). Aplicado só no
// endpoint /api/v1/render-and-store — as rotas antigas (UI, demos)
// continuam sem autenticação, fora de escopo desta mudança.
const apiSharedSecret = (process.env.API_SHARED_SECRET || '').trim();

function requireSecret(req: Request, res: Response, next: NextFunction) {
  if (!apiSharedSecret) return next();
  const provided = req.header('x-api-secret') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== apiSharedSecret) {
    return res.status(401).json({ success: false, error: 'auth obrigatória — header x-api-secret ausente ou inválido' });
  }
  return next();
}

// Service role: necessária pro endpoint /api/v1/render-and-store gravar no
// bucket conteudo_aluno (RLS não permite ANON_KEY nesse bucket). As rotas
// antigas de Storage (test/upload/list, /api/v1/supabase/sync) continuam
// usando SUPABASE_ANON_KEY via url/anonKey do body ou env — não mexer nelas.
function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para /api/v1/render-and-store');
  }
  return createClient(url, key);
}

// Monta URL absoluta pro host deste serviço. Prefere APP_URL (configurável
// em produção/atrás de proxy); cai pro host da própria request em dev local.
// "MY_APP_URL" é o placeholder do .env.example — nunca um valor real.
function buildAppUrl(req: Request, path: string): string {
  const configured = (process.env.APP_URL || '').trim();
  const base = configured && configured !== 'MY_APP_URL'
    ? configured.replace(/\/+$/, '')
    : `${req.protocol}://${req.get('host')}`;
  return `${base}${path}`;
}

// Supported Free-Tier and Fast Reliable Models
// gemini-2.5-flash e gemini-2.5-flash-lite removidos: retornam 404 "no
// longer available to new users" em producao (contas novas so tem acesso
// a serie 3.x/flash-latest) - reproduzido repetidamente nos logs, cada
// chamada desperdicava a primeira tentativa nesses dois modelos aposentados
// antes de cair pro resto do pool. Mesmo saneamento ja feito nas listas de
// fallback do microservice/api-brainhex e da API Python.
export const FREE_TIER_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
] as const;

// Key & Model Rotation State
let globalKeyIndex = 0;
let globalModelIndex = 0;

/**
 * Extract all available Gemini API keys from environment and request body (up to 8 keys)
 */
function getApiKeysPool(requestKeys?: string[]): string[] {
  const keysSet = new Set<string>();

  // 1. Check primary env key
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    keysSet.add(process.env.GEMINI_API_KEY.trim());
  }

  // 2. Check numbered env keys (GEMINI_API_KEY_1 to GEMINI_API_KEY_8)
  for (let i = 1; i <= 8; i++) {
    const envVal = process.env[`GEMINI_API_KEY_${i}`];
    if (envVal && envVal.trim()) {
      keysSet.add(envVal.trim());
    }
  }

  // 3. Add any keys passed in request payload (if valid string)
  if (Array.isArray(requestKeys)) {
    for (const k of requestKeys) {
      if (typeof k === 'string' && k.trim() && k.length > 10) {
        keysSet.add(k.trim());
      }
    }
  }

  return Array.from(keysSet).slice(0, 8);
}

/**
 * Strict regex to strip any unicode emojis from text fields
 */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

export function stripEmojis<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(EMOJI_REGEX, '').trim() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripEmojis(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      cleaned[k] = stripEmojis(v);
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Execute Gemini generateContent with multi-key and multi-model rotation & retry,
 * supporting multimodal attachments (audio, video, PDF, text, docx, pptx base64)
 * and seamless fallback across models when 503 (high demand) or 429 (rate limit) occurs.
 */
async function generateWithKeyRotation(
  promptSystem: string,
  promptUser: string,
  options: {
    preferredModel?: string;
    rotateModels?: boolean;
    requestKeys?: string[];
    schema?: any;
    maxOutputTokens?: number;
    attachments?: Array<{
      name?: string;
      mimeType: string;
      dataBase64?: string;
      textContent?: string;
    }>;
  } = {}
) {
  const keysPool = getApiKeysPool(options.requestKeys);

  if (keysPool.length === 0) {
    throw new Error('Nenhuma GEMINI_API_KEY encontrada no servidor ou na requisição.');
  }

  // Build model pool starting with preferred model, followed by reliable fallbacks.
  // Default era 'gemini-2.5-flash' (aposentado, 404) - toda chamada sem
  // preferredModel explicito desperdicava a primeira tentativa nele antes
  // de cair pro resto do pool.
  const preferred = options.preferredModel || FREE_TIER_MODELS[0];
  const modelPool: string[] = [
    preferred,
    ...FREE_TIER_MODELS.filter((m) => m !== preferred),
  ];

  let lastError: any = null;
  // Ensure enough retry attempts across keys AND models
  const totalAttempts = Math.max(keysPool.length * 3, modelPool.length * 2, 8);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    // Rotate keys across attempts
    const currentKeyIdx = (globalKeyIndex + attempt) % keysPool.length;
    const currentKey = keysPool[currentKeyIdx];

    // On failure or when rotateModels is true, rotate through available models
    const currentModelIdx = (globalModelIndex + attempt) % modelPool.length;
    const currentModel = modelPool[currentModelIdx] || FREE_TIER_MODELS[0];

    try {
      const ai = new GoogleGenAI({
        apiKey: currentKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Build multimodal contents parts
      const parts: any[] = [];

      // Add attached files if any
      if (Array.isArray(options.attachments) && options.attachments.length > 0) {
        for (const att of options.attachments) {
          // Imagem em formato que a API nao aceita (ex.: gif/bmp vindos de
          // .pptx do professor) e omitida do payload do modelo em vez de
          // derrubar a chamada inteira - ver canSendAsGeminiInlineData. O
          // indice na lista de attachments nao muda por causa disso.
          if (att.dataBase64 && att.mimeType && canSendAsGeminiInlineData(att.mimeType)) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.dataBase64,
              },
            });
          } else if (att.textContent) {
            parts.push({
              text: `\n=== MATERIAL FONTE ANEXADO: [${att.name || 'Documento'}] ===\n${att.textContent}\n=== FIM DO MATERIAL FONTE ===\n`,
            });
          }
        }
      }

      // Add instructions and prompts
      parts.push({
        text: `${promptSystem}\n\n${promptUser}`,
      });

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { role: 'user', parts },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: options.schema,
          temperature: 0.7,
          maxOutputTokens: options.maxOutputTokens ?? 8192,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Resposta vazia retornada pelo modelo Gemini.');
      }

      // Advance rotation pointers on success
      globalKeyIndex = (currentKeyIdx + 1) % keysPool.length;
      globalModelIndex = (currentModelIdx + 1) % modelPool.length;

      return {
        text,
        keyIndexUsed: currentKeyIdx + 1,
        totalKeysAvailable: keysPool.length,
        modelUsed: currentModel,
        // Diagnostico pra JSON.parse(text) falhar com "Unterminated string"
        // no chamador (ver generateDeckSlidesInBatches) - sem isso nao da
        // pra distinguir resposta truncada por MAX_TOKENS de outro tipo de
        // JSON malformado. Mesmo padrao de diagnostico ja usado no TrailUp
        // microservice (geminiService.ts, log "[gemini-diag]").
        finishReason: response.candidates?.[0]?.finishReason,
        usageMetadata: response.usageMetadata,
      };
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || JSON.stringify(err);
      const is503HighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE');
      const is429RateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');

      console.warn(
        `[Gemini Failover] Tentativa ${attempt + 1}/${totalAttempts} com chave #${currentKeyIdx + 1} e modelo ${currentModel} falhou (${is503HighDemand ? '503 Sobrecarga' : is429RateLimit ? '429 Quota' : 'Erro'}). Alternando para o próximo modelo/chave...`
      );

      // Short delay with jitter before next attempt
      const delayMs = is503HighDemand ? 400 : is429RateLimit ? 800 : 300;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Todas as chaves e modelos falharam.');
}

// API: Microservice Health, Liveness & Readiness Probe
const handleHealthCheck = (req: Request, res: Response) => {
  const keys = getApiKeysPool();
  res.json({
    status: 'healthy',
    service: 'trailup-brainhex-microservice',
    version: SERVICE_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    startTime: SERVICE_START_TIME.toISOString(),
    timestamp: new Date().toISOString(),
    keysAvailable: keys.length,
    freeModels: FREE_TIER_MODELS,
    env: process.env.NODE_ENV || 'development',
    memoryUsageMb: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
};

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);
app.get('/api/v1/health', handleHealthCheck);

// GET /api/v1/decks/:bucket/* — serve um deck gerado por /render-and-store
// com Content-Type correto. Não usamos a URL pública do Supabase Storage
// (ver comentário em /render-and-store) porque o gateway público força
// text/plain + CSP sandbox pra .html, o que impede o WebView do mobile de
// executar o deck interativo. Aqui baixamos via service role (server-to-
// server, não passa pelo gateway público) e devolvemos o Content-Type certo.
// Sem auth de propósito: mesma exposição que uma URL pública já teria.
app.get('/api/v1/decks/:bucket/*', async (req: Request, res: Response) => {
  const { bucket } = req.params;
  // Express 4 expõe o resto do path casado pelo "*" em params[0].
  const objectPath = (req.params as Record<string, string>)['0'];

  if (!bucket || !objectPath) {
    return res.status(400).json({ success: false, error: 'bucket e path são obrigatórios.' });
  }
  if (objectPath.includes('..')) {
    return res.status(400).json({ success: false, error: 'path inválido.' });
  }

  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !data) {
      return res.status(404).json({ success: false, error: error?.message ?? 'arquivo não encontrado' });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(buffer);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Microservice OpenAPI 3.0.3 Specification
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TrailUp BrainHex Generation Microservice API',
    version: SERVICE_VERSION,
    description:
      'Microserviço RESTful para geração de apresentações pedagógicas adaptadas aos 7 perfis BrainHex (Idris, Kwame, Amara, Kenji, Amina, Mateo & Zuri, Ember), com exportação para Supabase e roteirização.',
    contact: {
      name: 'TrailUp Core Engineering',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base URL',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check probe',
        responses: {
          '200': { description: 'Microservice status and uptime' },
        },
      },
    },
    '/profiles': {
      get: {
        summary: 'List all 7 BrainHex Guide Personas and pedagogic profiles',
        responses: {
          '200': { description: 'Array of profiles' },
        },
      },
    },
    '/profiles/{profileId}': {
      get: {
        summary: 'Get single BrainHex profile by ID',
        parameters: [
          {
            name: 'profileId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Profile details' },
          '404': { description: 'Profile not found' },
        },
      },
    },
    '/generate': {
      post: {
        summary: 'Generate pedagogical BrainHex presentation deck',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetProfile'],
                properties: {
                  topic: { type: 'string' },
                  sourceText: { type: 'string' },
                  targetProfile: {
                    type: 'string',
                    enum: [
                      'mastermind',
                      'achiever',
                      'seeker',
                      'survivor',
                      'conqueror',
                      'socializer',
                      'daredevil',
                    ],
                  },
                  classe: { type: 'string' },
                  slideCount: { type: 'number' },
                  preferredModel: { type: 'string' },
                  autoSaveSupabase: { type: 'boolean' },
                  supabaseUrl: { type: 'string' },
                  supabaseAnonKey: { type: 'string' },
                  supabaseBucket: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Deck generated successfully' },
          '400': { description: 'Invalid parameters' },
          '500': { description: 'Generation error' },
        },
      },
    },
    '/prompt-preview': {
      post: {
        summary: 'Preview the compiled system and user prompt for testing without consuming AI tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetProfile'],
                properties: {
                  topic: { type: 'string' },
                  targetProfile: { type: 'string' },
                  sourceText: { type: 'string' },
                  slideCount: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Compiled prompts returned' },
        },
      },
    },
  },
};

app.get('/openapi.json', (req: Request, res: Response) => {
  res.json(openApiSpec);
});
app.get('/api/v1/openapi.json', (req: Request, res: Response) => {
  res.json(openApiSpec);
});

// API: Microservice Documentation JSON Endpoint
app.get('/api/v1/docs', (req: Request, res: Response) => {
  res.json({
    service: 'TrailUp BrainHex Presentation Generator Microservice',
    version: SERVICE_VERSION,
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/health',
        description: 'Verificação de liveness e prontidão do microserviço',
      },
      {
        method: 'GET',
        path: '/api/v1/profiles',
        description: 'Lista todos os 7 perfis BrainHex e seus Guardiões oficiais',
      },
      {
        method: 'GET',
        path: '/api/v1/profiles/:profileId',
        description: 'Consulta detalhes e arquétipo de um perfil específico (ex: mastermind, achiever)',
      },
      {
        method: 'POST',
        path: '/api/v1/generate',
        description: 'Gera apresentação de slides completa adaptada ao perfil, com roteiro e markdown',
        bodyExample: {
          topic: 'Arquitetura de Microsserviços e Event-Driven Design',
          targetProfile: 'mastermind',
          classe: 'Turma-Engenharia-2026',
          slideCount: 8,
          autoSaveSupabase: false,
        },
      },
      {
        method: 'POST',
        path: '/api/v1/prompt-preview',
        description: 'Visualiza o prompt pedagógico compilado sem gastar tokens da API',
      },
      {
        method: 'POST',
        path: '/api/supabase/save-conteudo-aluno',
        description: 'Salva deck, markdown e áudio no Supabase na estrutura /{perfil}/{topicos}/{classe}/',
      },
    ],
    curlExample: `curl -X POST http://localhost:3000/api/v1/generate \\
  -H "Content-Type: application/json" \\
  -d '{"topic": "Introdução ao Kubernetes", "targetProfile": "mastermind", "slideCount": 8}'`,
  });
});

// API: Keys Pool Info
app.get('/api/keys-status', (req: Request, res: Response) => {
  const keys = getApiKeysPool();
  res.json({
    keysCount: keys.length,
    models: FREE_TIER_MODELS,
    hasEnvKey: !!process.env.GEMINI_API_KEY,
  });
});

// JSON Schema for BrainHex Slides with Slidesgo-Grade Thematic Elements and Full Microservice Depth
const DECK_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    subject: { type: Type.STRING },
    classe: { type: Type.STRING },
    visualThematicArchetype: {
      type: Type.STRING,
      description: 'nature-eco | celestial-palace | scrapbook-stickers | cyber-tech | royal-luxury | indian-heritage | islamic-ramadan | trailup-astral | medieval-rpg',
    },
    characterGuideName: { type: Type.STRING },
    estimatedMinutes: { type: Type.NUMBER },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    subtopicsList: { type: Type.ARRAY, items: { type: Type.STRING } },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            description:
              'cover | story_intro | concept_breakdown | timeline_process | stats_metrics | comparison_grid | bento_cards | interactive_challenge | decision_branch | checklist_quest | boss_battle | deep_lore | peer_collab | epic_conclusion',
          },
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          subtopic: { type: Type.STRING, description: 'Subtópico específico ou módulo desta etapa' },
          narrativeText: { type: Type.STRING, description: 'Texto narrativo imersivo conectando o tema à ambientação' },
          pedagogicalObjective: {
            type: Type.STRING,
            description: 'Objetivo pedagógico claro, mensurável e específico deste slide',
          },
          thematicStorytelling: {
            type: Type.OBJECT,
            properties: {
              storyArcPhase: {
                type: Type.STRING,
                description: 'Fase do arco pedagógico (ex: "Fase 1: Chamado & Desafio Inicial", "Fase 2: Imersão nos Fundamentos", "Fase 3: Revelação do Mecanismo Oculto", "Fase 4: Clímax & Maestria")',
              },
              environmentSetting: {
                type: Type.STRING,
                description: 'Cenário temático imersivo do perfil BrainHex (ex: "Observatório Astral & Cúpula dos Tomos Cósmicos")',
              },
              voiceTone: {
                type: Type.STRING,
                description: 'Tom de voz do guia oficial do perfil (ex: "Idris - Analítico, rigoroso e baseado em primeiros princípios")',
              },
              narrativeBeat: {
                type: Type.STRING,
                description: 'Ponte narrativa imersiva de 1 a 2 frases conectando a ambientação ao tema técnico deste slide',
              },
            },
            required: ['storyArcPhase', 'environmentSetting', 'voiceTone', 'narrativeBeat'],
          },
          conceptTitle: { type: Type.STRING },
          contentParagraphs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'De 2 a 4 parágrafos densos, aprofundados e explicativos sobre este subtópico, com substância técnica real, sem textos curtos ou resumos superficiais.',
          },
          keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
          
          // Character Guide & Storytelling
          characterGuide: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              speechText: { type: Type.STRING, description: 'Fala explicativa imersiva do personagem guia contextualizando o tema na sua voz e tom característicos' },
              analogy: { type: Type.STRING, description: 'Analogia rica e clara conectando o conceito com o mundo real ou universo temático' },
              tone: { type: Type.STRING },
            },
            required: ['name', 'speechText'],
          },

          // AI-Generated Unique Thematic Vector Visuals & Medieval Prompts (Icons, Dividers & Frame Borders per Slide)
          aiDecorations: {
            type: Type.OBJECT,
            properties: {
              customIconSvg: {
                type: Type.STRING,
                description: 'Código SVG puro e minimalista com viewBox="0 0 100 100" contendo um ícone/brasão vetorial medieval exclusivo para o assunto deste slide (com stroke="currentColor" e fill apropriado)',
              },
              medievalPromptDescription: {
                type: Type.STRING,
                description: 'Prompt de arte detalhado gerado para orientar a composição medieval dos elementos visuais deste slide',
              },
              medievalClassArchetype: {
                type: Type.STRING,
                description: 'Arquétipo de classe medieval (ex: Paladino da Honra, Arquimago Hermético, Cartógrafo Místico, Guardião da Bastilha, Berserker Flamejante, Senhor da Guerra, Bardo da Távola)',
              },
              iconDescription: {
                type: Type.STRING,
                description: 'Descrição do brasão ou ícone heráldico gerado',
              },
              motifDescription: {
                type: Type.STRING,
                description: 'Conceito visual único gerado por IA para este slide',
              },
            },
          },

          referenceImageIndex: {
            type: Type.NUMBER,
            description: 'Índice (0-based) da imagem de referência anexada (ver seção "IMAGENS DE REFERÊNCIA ANEXADAS" no prompt) que é diretamente relevante a este slide. Omita este campo se não houver imagem relevante — não invente um índice.',
          },
          restyleReferenceImage: {
            type: Type.BOOLEAN,
            description: 'Só relevante junto com referenceImageIndex. true quando a imagem original se beneficia de uma versão nova estilizada pro perfil BrainHex (ex.: foto genérica, fora do tom do perfil); false ou omitido quando a imagem original já serve como exemplo visual direto (ex.: diagrama técnico já claro).',
          },

          // Written & Visual Practical Example
          writtenExample: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              explanation: { type: Type.STRING },
              codeOrDiagram: { type: Type.STRING },
              visualIcon: { type: Type.STRING },
            },
            required: ['title', 'explanation'],
          },

          // Slidesgo Thematic Framework & Illustrative Elements
          thematicFrame: {
            type: Type.STRING,
            description: 'islamic-arch | indian-palace-arch | scrapbook-tape | eco-nature | cyber-hud | royal-luxury | notched-ticket | parchment-scroll | trailup-sigil | minimal-glass',
          },
          illustrationType: {
            type: Type.STRING,
            description: 'earth_mascot | islamic_mosque_moon | scrapbook_stickers | cyber_sphere | lantern_chandelier | nature_foliage | royal_crest | trailup_guardians | dunes_sunset | indian_oriental_skyline | hanging_lanterns_gold | tech_radar_globe | washi_paper_notes | celestial_astrolabe | ancient_pillars',
          },
          stickyNote: {
            type: Type.OBJECT,
            properties: {
              badge: { type: Type.STRING },
              text: { type: Type.STRING },
              color: { type: Type.STRING, description: 'yellow | pink | purple | cyan' },
            },
          },

          // Slidesgo-Style Visual Infographic Elements
          timelineSteps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                badge: { type: Type.STRING },
                highlight: { type: Type.BOOLEAN },
              },
              required: ['stepNumber', 'title', 'description'],
            },
          },
          metricCards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                label: { type: Type.STRING },
                sublabel: { type: Type.STRING },
                trend: { type: Type.STRING },
                iconType: { type: Type.STRING },
              },
              required: ['value', 'label'],
            },
          },
          comparisonColumns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                highlight: { type: Type.BOOLEAN },
                badge: { type: Type.STRING },
                items: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'items'],
            },
          },
          bentoCards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                tag: { type: Type.STRING },
                stat: { type: Type.STRING },
                highlight: { type: Type.BOOLEAN },
                iconType: { type: Type.STRING },
              },
              required: ['title', 'description'],
            },
          },

          quote: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              author: { type: Type.STRING },
            },
          },
          interactiveType: {
            type: Type.STRING,
            description: 'quiz | checklist | decision | secret_reveal | code_inspect | none',
          },
          quiz: {
            type: Type.OBJECT,
            properties: {
              // maxLength e best-effort (nem todo caminho do SDK/modelo
              // respeita) - a garantia real e a sanitizacao pos-geracao em
              // sanitizeQuizContent(), chamada antes da paginacao. Sem
              // nenhum limite aqui, producao real mostrou o modelo entrar
              // em loop de repeticao e gerar milhares de caracteres pra uma
              // unica pergunta/alternativa (slide de quiz gigante, com
              // scroll, texto minusculo espremido).
              question: { type: Type.STRING, maxLength: 220 },
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING, maxLength: 140 },
                    isCorrect: { type: Type.BOOLEAN },
                    explanation: { type: Type.STRING, maxLength: 260 },
                  },
                  required: ['id', 'text', 'isCorrect', 'explanation'],
                },
              },
            },
          },
          checklist: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                xp: { type: Type.NUMBER },
              },
              required: ['id', 'text', 'xp'],
            },
          },
          decisionChoices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING },
                outcome: { type: Type.STRING },
                xpReward: { type: Type.NUMBER },
              },
              required: ['id', 'label', 'description', 'outcome', 'xpReward'],
            },
          },
          secretLore: {
            type: Type.OBJECT,
            properties: {
              hint: { type: Type.STRING },
              revealedContent: { type: Type.STRING },
            },
          },
          codeSnippet: {
            type: Type.OBJECT,
            properties: {
              language: { type: Type.STRING },
              code: { type: Type.STRING },
            },
          },
          rpgQuest: {
            type: Type.OBJECT,
            properties: {
              questName: { type: Type.STRING },
              xpValue: { type: Type.NUMBER },
              difficulty: { type: Type.STRING },
              bossHp: { type: Type.NUMBER },
            },
          },
          interactiveElement: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: {
                type: Type.STRING,
                description: 'mini_quiz | reflection_point | action_prompt | decision_choice | mastery_checklist | code_inspect',
              },
              title: { type: Type.STRING },
              badge: { type: Type.STRING },
              prompt: { type: Type.STRING },
              contextHint: { type: Type.STRING },
              xpReward: { type: Type.NUMBER },
              quizOptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING, maxLength: 140 },
                    isCorrect: { type: Type.BOOLEAN },
                    explanation: { type: Type.STRING, maxLength: 260 },
                  },
                },
              },
              guidingQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              sampleReflection: { type: Type.STRING },
              suggestedAction: { type: Type.STRING },
              userNotePlaceholder: { type: Type.STRING },
              actionInstructions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              expectedDeliverable: { type: Type.STRING },
              decisionChoices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    description: { type: Type.STRING },
                    outcome: { type: Type.STRING },
                    xpReward: { type: Type.NUMBER },
                  },
                },
              },
              checklistItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                    xp: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
          // Rich Visual References, Diagrams, Topologies & Maps
          visualDiagram: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'system_topology | flow_roadmap | comparison_matrix | metric_radar | code_pipeline | concept_tree',
              },
              title: { type: Type.STRING },
              caption: { type: Type.STRING },
              badge: { type: Type.STRING },
              nodes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    sublabel: { type: Type.STRING },
                    icon: { type: Type.STRING },
                    status: { type: Type.STRING },
                    layer: { type: Type.STRING },
                    details: { type: Type.STRING },
                  },
                },
              },
              connections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    from: { type: Type.STRING },
                    to: { type: Type.STRING },
                    label: { type: Type.STRING },
                  },
                },
              },
              metrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    change: { type: Type.STRING },
                  },
                },
              },
              comparisonMatrix: {
                type: Type.OBJECT,
                properties: {
                  headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        criteria: { type: Type.STRING },
                        values: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                    },
                  },
                },
              },
              codeVisual: {
                type: Type.OBJECT,
                properties: {
                  language: { type: Type.STRING },
                  title: { type: Type.STRING },
                  code: { type: Type.STRING },
                },
              },
            },
          },
          visualExamples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                context: { type: Type.STRING },
                solutionVisual: { type: Type.STRING },
                impactMetrics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      value: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
          layout: {
            type: Type.STRING,
            description:
              'split-character | full-banner | parchment-scroll | arcane-codex | battle-arena | discovery-map | monumental-card | bento-grid | timeline-flow | metric-dashboard | versus-split',
          },
          presenterNotes: { type: Type.STRING },
        },
        required: [
          'id',
          'type',
          'title',
          'contentParagraphs',
          'layout',
          'interactiveType',
          'thematicStorytelling',
          'pedagogicalObjective',
          'characterGuide',
        ],
      },
    },
  },
  required: ['title', 'subtitle', 'subject', 'slides'],
};

// Character Guide Personas Map (Official TrailUp BrainHex Personas)
const BRAINHEX_GUIDES: Record<
  string,
  {
    name: string;
    title: string;
    color: string;
    quote: string;
    description: string;
    traits: string[];
    archetype: string;
    namePt: string;
    voice: string;
    environment: string;
  }
> = {
  mastermind: {
    name: 'Idris',
    title: 'O Sábio das Constelações',
    color: '#707c88ff',
    quote: 'Toda pergunta certa já contém metade da resposta.',
    description:
      'Dizem que Idris nasceu sob uma chuva de estrelas. Enquanto outros procuram respostas, ele busca padrões ocultos que conectam todas as coisas. Para ele, conhecimento não é acumular informações, mas enxergar além do óbvio. Cada decisão começa com uma pergunta, e cada estratégia nasce da compreensão do cenário antes do primeiro passo.',
    traits: ['Analítico', 'Estratégico', 'Profundo'],
    archetype: 'Arquimago da Lógica & Lore',
    namePt: 'Estrategista',
    voice: 'Analítico, oracular, baseado em primeiros princípios, matrizes de trade-offs, desconstrução lógica de axiomas e teoremas invariantes.',
    environment: 'Observatório Astral das Constelações & Tomos Celestiais (abóbada cósmica, esferas armilares, pergaminhos astronômicos e geometrias sagradas).',
  },
  achiever: {
    name: 'Kwame',
    title: 'O Cavaleiro Solar',
    color: 'rgb(173, 96, 2)',
    quote: 'Cada marco conquistado abre o próximo caminho.',
    description:
      'Kwame nunca acreditou em atalhos. Cada cicatriz em sua armadura representa uma promessa cumprida, uma meta alcançada e um dia em que escolheu continuar quando seria mais fácil desistir. Para ele, o sucesso não pertence aos mais talentosos, mas aos que seguem avançando mesmo quando ninguém está olhando.',
    traits: ['Focado', 'Disciplinado', 'Determinado'],
    archetype: 'Paladino da Glória',
    namePt: 'Realizador',
    voice: 'Nobre, resoluto, conciso, focado em metas de competência, scorecards de KPIs, critérios de aceitação e maestria 100%.',
    environment: 'Cidadela Solar dos Estandartes & Salão Dourado de Conquistas (ouro sagrado, estandartes heráldicos, vitrais e mapas de campanha).',
  },
  seeker: {
    name: 'Amara',
    title: 'A Guardiã das Runas',
    color: 'rgb(167, 140, 7)',
    quote: 'Todo mapa esconde uma pergunta melhor que a resposta.',
    description:
      'Amara percorre ruínas esquecidas em busca de conhecimentos que o tempo tentou apagar. Ela acredita que cada descoberta revela um novo mistério, tornando a jornada mais valiosa que o destino. Sua maior habilidade não é encontrar respostas, mas nunca perder a curiosidade que a impulsiona a seguir em frente.',
    traits: ['Curiosa', 'Exploradora', 'Intuitiva'],
    archetype: 'Ranger dos Mistérios',
    namePt: 'Explorador',
    voice: 'Curioso, instigante, investigativo, revelando enigmas históricos, conexões profundas e pistas arcanas da infraestrutura.',
    environment: 'Ruínas Arcanas Esquecidas, Florestas Silvestres de Éter & Cartografia de Fronteiras Inexploradas (monólitos antigos, bússolas místicas e manuscritos).',
  },
  survivor: {
    name: 'Kenji',
    title: 'O Guardião da Montanha',
    color: '#720101',
    quote: 'Sobreviver é ter um plano B. Redundância não é desperdício.',
    description:
      'Durante anos, Kenji protegeu sozinho uma antiga passagem entre montanhas, onde um único erro podia custar tudo. Ele aprendeu que coragem não é ignorar os riscos, mas estar preparado para eles. Enquanto outros apostam tudo em uma única chance, Kenji sempre constrói uma segunda saída.',
    traits: ['Paciente', 'Resiliente', 'Confiável'],
    archetype: 'Monge Guardião da Fortaleza',
    namePt: 'Sobrevivente',
    voice: 'Sereno, paciente, resiliente e prudente, focado em defesa em profundidade, contenção de falhas (SPOF), redundância e antifragilidade.',
    environment: 'Fortaleza Inviolável da Montanha & Desfiladeiro Rúnico dos Ventos (pedra maciça talhada, escudos de ferro e baluartes de salvaguardas).',
  },
  conqueror: {
    name: 'Amina',
    title: 'A Rainha da Tempestade',
    color: '#01808bff',
    quote: 'Não existe segundo lugar na sua própria jornada.',
    description:
      'Amina lidera como a própria tempestade: intensa, determinada e impossível de ignorar. Ela acredita que o maior adversário nunca é quem está ao lado, mas a versão de ontem de si mesma. Sua liderança inspira outros a enfrentarem desafios que pareciam inalcançáveis e a nunca aceitarem menos do que seu verdadeiro potencial.',
    traits: ['Líder', 'Competitiva', 'Determinada'],
    archetype: 'Comandante Suprema da Arena',
    namePt: 'Conquistador',
    voice: 'Intenso, comandante, eletrizante e competitivo, focado em superação de gargalos críticos, alta performance e vitórias em combate.',
    environment: 'Arena Imperial da Tempestade & Bastião dos Reis (safira imperial, fogo azul, estandartes de batalha e arena de Boss Battle).',
  },
  socializer: {
    name: 'Mateo & Zuri',
    title: 'Os Gêmeos Espíritos da Aurora',
    color: 'rgb(109, 21, 190)',
    quote: 'Ninguém chega longe sozinho... nem mesmo você.',
    description:
      'Mateo conquista pessoas com histórias que despertam esperança, enquanto Zuri enxerga sentimentos escondidos até mesmo no silêncio. Juntos, unem pessoas, constroem alianças e transformam desconhecidos em companheiros de jornada. Eles sabem que os maiores feitos sempre começam com uma boa conexão.',
    traits: ['Comunicativo', 'Empático', 'Inspirador'],
    archetype: 'Mentores da Guilda',
    namePt: 'Socializador',
    voice: 'Acolhedor, dialógico, empático e comunitário, focado em inteligência coletiva, sinergia de guilda, escuta ativa e casos humanos.',
    environment: 'Taverna Encantada da Aliança, Fogueira da Guilda & Mural Coletivo de Histórias (madeira acolhedora, lanternas douradas e mural de ideias).',
  },
  daredevil: {
    name: 'Ember',
    title: 'A Fênix do Caos',
    color: '#1b6b1b',
    quote: 'Hesitar é a única forma de perder.',
    description:
      'Ember nunca espera o momento perfeito, porque acredita que ele simplesmente não existe. Ela mergulha no desconhecido, aprende com cada desafio e transforma cada queda em impulso para voar ainda mais alto. Para ela, o medo não é um obstáculo, mas a prova de que vale a pena seguir em frente.',
    traits: ['Ousada', 'Energética', 'Impulsiva'],
    archetype: 'Líder Tática de Intervenção',
    namePt: 'Aventureiro / Ousado',
    voice: 'Ousado, elétrico, veloz e pragmático, focado em intervenção rápida, ação sob fogo, simulação de incidentes e drills práticos.',
    environment: 'Forja Primordial do Caos & Centro de Resposta Rápida (chamas ardentes, centelhas de magma, painéis de choque e ritmo veloz).',
  },
};

function getGuideForProfile(profileName: string) {
  const norm = String(profileName || '').trim().toLowerCase();
  return BRAINHEX_GUIDES[norm] || BRAINHEX_GUIDES.achiever;
}

// Profile structural blueprint definitions
const PROFILE_STRUCTURAL_BLUEPRINTS: Record<string, {
  namePt: string;
  focusTitle: string;
  pedagogicalPhilosophy: string;
  mandatorySlideSequence: string;
  endingVariations: string;
  forbiddenPatterns: string;
}> = {
  achiever: {
    namePt: 'Realizador',
    focusTitle: 'Trilha de Metas 100%, Scorecards de KPIs, Validação Sequencial & Certificação de Maestria',
    pedagogicalPhilosophy: 'Design Instrucional Orientado a Metas Claras, Critérios de Aceitação Estritos, Mensuração Contínua e Conquista de 100% de Maestria.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Alinhamento de Missão Estratégica, Metas Mensuráveis e XP Total.
    - Slide 2: 'stats_metrics' -> Painel de Indicadores e Scorecard de KPIs (mínimo 3 metricCards com metas quantitativas e benchmarks do conteúdo).
    - Slide 3: 'timeline_process' -> Roadmap Metódico de Execução em Fases Sequenciais (timelineSteps numerados com critérios de transição).
    - Slide 4: 'bento_cards' -> Pilares Fundamentais e Critérios Técnicos de Aceitação (bentoCards com tags e definições extraídas do conteúdo).
    - Slide 5: 'concept_breakdown' -> Decomposição Modular e Padrões de Qualidade (com keyTakeaways e exemplos escritos).
    - Slide 6: 'comparison_grid' -> Padrão de Excelência vs Desvios de Conformidade e Falhas Comuns de Execução.
    - Slide 7: 'checklist_quest' -> Checklist de Execução Prática e Validação de Campo com XP detalhado por item.
    - Slide 8: 'interactive_challenge' -> Quiz de Precisão Técnica Estrita e Conformidade de Parâmetros com feedback formativo.
    - Slide 9+: 'epic_conclusion' OU 'checklist_quest' OU 'bento_cards' -> Desfecho Dinâmico Adaptado (Síntese Pedagógica de Maestria 100%, Scorecard Final de Validação ou Plano de Ação Imediato).`,
    endingVariations: 'O encerramento deve variar de acordo com o conteúdo: Síntese de Maestria 100%, Scorecard de Validação Prática, Roadmap de Aplicação Imediata no Trabalho ou Selo de Excelência Técnica.',
    forbiddenPatterns: 'Proibido narrativas abstratas sem metas claras, ausência de KPIs numéricos ou conclusões vazias sem critérios de entrega validados.',
  },
  mastermind: {
    namePt: 'Estrategista',
    focusTitle: 'Códice de Axiomas, Engenharia de Primeiros Princípios, Matrizes de Trade-Offs & Epílogo Sistêmico',
    pedagogicalPhilosophy: 'Desconstrução Lógica a partir de Primeiros Princípios, Códices Arcanos de Lore Oculto, Teoremas Invariantes e Avaliação Rigorosa de Trade-Offs Arquiteturais.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Tese Central do Sistema, Axioma Primário e Diagramação Estrutural de Camadas.
    - Slide 2: 'deep_lore' -> Códice Arcano #1: O Lore Filosófico e Leis Invariantes que Regem o Sistema (com secretLore revelável sobre a causa-raiz).
    - Slide 3: 'bento_cards' -> Decomposição Anatômica e Taxonomia de Módulos (bentoCards com interfaces e contratos de dados).
    - Slide 4: 'concept_breakdown' -> Engenharia de Primeiros Princípios & Formalismo Lógico (com codeSnippet técnico ou diagrama formal).
    - Slide 5: 'comparison_grid' -> Matriz Rigorosa de Trade-Offs (Latência vs Consistência, Acoplamento vs Escalabilidade, etc.).
    - Slide 6: 'deep_lore' -> Códice Arcano #2: Invariantes Ocultas, Teoremas e Casos de Borda Críticos (com secretLore avançado).
    - Slide 7: 'decision_branch' -> Árvore de Decisão Estratégica com Ramificações e Análise de Impactos Colaterais.
    - Slide 8: 'interactive_challenge' -> Quiz de Análise Sistêmica e Decisão de Arquitetura Lógica com justificativas de trade-off.
    - Slide 9+: 'epic_conclusion' OU 'bento_cards' OU 'decision_branch' -> Desfecho Dinâmico Adaptado (Síntese de Princípios Imutáveis para Arquiteturas Duradouras, Matriz de Teoremas do Futuro ou Desafio Aberto de Otimização Sistêmica).`,
    endingVariations: 'O encerramento deve variar: Síntese de Leis Fundamentais Duradouras, Epílogo Arquitetural com Teoremas Finais, Matriz de Axiomas para o Futuro ou Dilema de Arquitetura Aberto.',
    forbiddenPatterns: 'Proibido tutoriais superficiais sem profundidade lógica, regras sem justificativa de causa-raiz ou falta de matriz comparativa de trade-offs.',
  },
  seeker: {
    namePt: 'Explorador',
    focusTitle: 'Expedição Investigativa, Dossiê Histórico, Pistas Arcanas & Cartografia de Novas Fronteiras',
    pedagogicalPhilosophy: 'Aprendizagem Baseada em Investigação, Curiosidade Epistêmica, Dossiês Evolutivos, Descoberta de Mecanismos Ocultos e Mapeamento de Horizontes.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Enigma Central da Expedição e Cartografia Inicial do Saber.
    - Slide 2: 'deep_lore' -> As Origens Ocultas e Dossiê Histórico da Gênese do Problema (com secretLore sobre motivações históricas).
    - Slide 3: 'timeline_process' -> Linha do Tempo Evolutiva & Grandes Descobertas Históricas (timelineSteps cronológicos detalhados).
    - Slide 4: 'bento_cards' -> Cartografia do Saber, Curiosidades Fascinantes & Conexões Ocultas (bentoCards com fatos surpreendentes).
    - Slide 5: 'concept_breakdown' -> Desconstrução Anatômica do Mecanismo Revelado (com analogias ricas e exemplos práticos).
    - Slide 6: 'comparison_grid' -> O Conhecido Tradicional vs As Novas Fronteiras e Paradigmas Emergentes.
    - Slide 7: 'deep_lore' -> Trilha de Pistas Arcanas e Revelação de Segredos Ocultos da Infraestrutura (com secretLore interativo).
    - Slide 8: 'interactive_challenge' -> Quiz de Enigma Investigativo e Dedução de Padrões Subjacentes com pistas reveladas.
    - Slide 9+: 'epic_conclusion' OU 'bento_cards' OU 'deep_lore' -> Desfecho Dinâmico Adaptado (Epílogo da Grande Expedição, Cartografia de Territórios Inexplorados, Manifesto do Explorador ou Dossiê de Próximos Mistérios a Decifrar).`,
    endingVariations: 'O encerramento deve variar: Epílogo da Grande Expedição, Mapa de Territórios Inexplorados com Recursos Recomendados, Manifesto do Conhecimento Contínuo ou Dossiê de Horizontes Futuros.',
    forbiddenPatterns: 'Proibido listas burocráticas secas, apresentação puramente técnica sem contexto de origem histórica ou ausência de mistérios/segredos reveláveis.',
  },
  conqueror: {
    namePt: 'Conquistador',
    focusTitle: 'Gauntlet de Combate, Arsenal Tático, Blitzkrieg Operacional & Batalha Épica contra Boss',
    pedagogicalPhilosophy: 'Treinamento de Alta Intensidade, Eliminação Implacável de Gargalos Críticos e Domínio em Combate de Alta Performance.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Alerta de Missão de Guerra, Identificação da Ameaça e Declaração de Supremacia.
    - Slide 2: 'stats_metrics' -> Painel de Gargalos Críticos & KPIs de Pressão e Sobrecarga (metricCards agressivos com benchmarks).
    - Slide 3: 'comparison_grid' -> Arsenal Tático: Vulnerabilidades do Problema/Concorrentes vs Armas e Contramedidas de Domínio.
    - Slide 4: 'concept_breakdown' -> Manobras Táticas de Ataque e Otimização Extrema de Performance.
    - Slide 5: 'timeline_process' -> Fases de Cerco & Estratégia de Avanço Inabalável (timelineSteps de ofensiva técnica).
    - Slide 6: 'checklist_quest' -> Blitzkrieg Operacional e Protocolo de Execução sob Alta Pressão com XP Elevado.
    - Slide 7: 'interactive_challenge' -> Gauntlet de Domínio Tático & Eliminação de Gargalos Críticos.
    - Slide 8: 'boss_battle' -> Confronto Épico contra o Boss de Conhecimento (bossHp: 1000 a 1500, com desafios táticos e cálculo de dano).
    - Slide 9+: 'epic_conclusion' OU 'bento_cards' -> Desfecho Dinâmico Adaptado (Celebração da Vitória Esmagadora e Diretrizes de Domínio, Estandarte de Conquista ou Análise Tática Pós-Combate).`,
    endingVariations: 'O encerramento deve variar: Troféu Imperial de Domínio com Estandarte de Vitória, Ordem de Marcha e Expansão de Território, Debriefing de Combate de Alta Performance ou Condecoração Militar de Supremacia.',
    forbiddenPatterns: 'Proibido tom passivo ou lento, ausência de slide de Boss Battle [boss_battle] ou falta de métricas agressivas de superação.',
  },
  socializer: {
    namePt: 'Sociável',
    focusTitle: 'Assembleia da Guilda, Casos Humanos, Mural Colaborativo & Pacto de Aliança Coletiva',
    pedagogicalPhilosophy: 'Construtivismo Colaborativo, Inteligência Coletiva, Casos Centrados em Pessoas, Empatia e Tomada de Decisão Ético-Social.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Assembleia da Guilda, Propósito Compartilhado e Chamado à União de Talentos.
    - Slide 2: 'concept_breakdown' -> O Fator Humano e Estudos de Caso com Personagens Reais (histórias vivas, impactos e diálogos).
    - Slide 3: 'bento_cards' -> Mural Colaborativo de Ideias e Destaques Coletivos (thematicFrame: 'scrapbook-tape', com stickyNote).
    - Slide 4: 'timeline_process' -> Jornada da Construção Coletiva e Rituais de Sinergia de Equipe (timelineSteps de facilitação humana).
    - Slide 5: 'comparison_grid' -> Decisão Individualista Isolada vs Inteligência Coletiva da Guilda.
    - Slide 6: 'concept_breakdown' -> Práticas de Comunicação Transparente, Escuta Ativa e Inclusão no Ecossistema.
    - Slide 7: 'decision_branch' -> Dilema Ético de Equipe com Ramificações e Foco no Impacto Humano/Cultural.
    - Slide 8: 'interactive_challenge' -> Quiz de Dilema de Guilda e Decisão Ético-Colaborativa com consenso de pares.
    - Slide 9+: 'epic_conclusion' OU 'bento_cards' -> Desfecho Dinâmico Adaptado (Pacto de Aliança da Guilda e Síntese de Aprendizados, Roda de Saberes Compartilhados, Manifesto da Comunidade ou Mural de Legado).`,
    endingVariations: 'O encerramento deve variar: Pacto de Aliança da Guilda com Reconhecimento Coletivo, Manifesto da Comunidade de Aprendizes, Mural de Legado Coletivo ou Roda de Saberes e Troca de Experiências.',
    forbiddenPatterns: 'Proibido foco puramente mecanicista sem menção a pessoas e equipes, ausência de notas colaborativas (stickyNote) ou falta de dilemas éticos coletivos.',
  },
  daredevil: {
    namePt: 'Ousado',
    focusTitle: 'Operação Tática Zero-Hour, Simulação de Crise, Drills sob Fogo & Resposta a Incidentes',
    pedagogicalPhilosophy: 'Imersão Baseada em Cenários de Alta Pressão, Drills Táticos de Resposta a Incidentes, Ação Prática Imediata e Testes de Reflexo.',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Alerta Código Vermelho, Nível de Ameaça e Regras de Engajamento Imediatas.
    - Slide 2: 'stats_metrics' -> Telemetria Crítica de Choque & Indicadores Iminentes de Falha (metricCards de alerta e limites operacionais).
    - Slide 3: 'checklist_quest' -> Missão de Campo #1: Protocolo de Intervenção Rápida Zero-Hour com XP de Ação.
    - Slide 4: 'decision_branch' -> Missão de Campo #2: Dilema Tático sob Fogo / Bifurcação de Incidente Crítico em Tempo Real.
    - Slide 5: 'concept_breakdown' -> Regras de Ouro e Táticas de Sobrevivência Operacional Sem Teoria Abstrata.
    - Slide 6: 'interactive_challenge' -> Missão de Campo #3: Drill de Teste de Reflexos e Diagnóstico Relâmpago.
    - Slide 7: 'timeline_process' -> Cadeia de Reação Tática & Cronômetro de Contenção de Danos (timelineSteps de velocidade).
    - Slide 8: 'checklist_quest' -> Missão de Campo #4: Debriefing Tático de Pós-Incidente e Ações Corretivas Rápidas.
    - Slide 9+: 'epic_conclusion' OU 'checklist_quest' -> Desfecho Dinâmico Adaptado (Condecoração de Prontidão Operacional & Diretrizes de Ação Contínua, Protocolo de Resposta Imediata Gravado ou Simulação Pós-Crise).`,
    endingVariations: 'O encerramento deve variar: Condecoração de Prontidão Operacional, Protocolo de Resposta de Emergência Gravado no Manual de Campo, Debriefing Tático de Pós-Crise ou Síntese de Intervenção de Choque.',
    forbiddenPatterns: 'Proibido parágrafos teóricos passivos longos, burocracia acadêmica ou ausência de múltiplas missões práticas ativas com decisões sob fogo.',
  },
  survivor: {
    namePt: 'Sobrevivente',
    focusTitle: 'Manual de Sobrevivência, Mapeamento de SPOF, Defesa em Profundidade & Blindagem Antifrágil',
    pedagogicalPhilosophy: 'Engenharia de Resiliência, Defesa em Profundidade, Mitigação Proativa de Riscos e Eliminação de Pontos Únicos de Falha (SPOF).',
    mandatorySlideSequence: `
    - Slide 1: 'cover' -> Manual de Sobrevivência Operacional e Diretriz de Blindagem Antifrágil.
    - Slide 2: 'bento_cards' -> Mapeamento de Vetores de Falha, Riscos Críticos e Pontos Únicos de Falha (SPOF).
    - Slide 3: 'timeline_process' -> Protocolo Passo a Passo de Contenção, Quarentena e Mitigação de Incidentes.
    - Slide 4: 'concept_breakdown' -> Engenharia de Resiliência, Defesa em Profundidade e Circuit Breakers.
    - Slide 5: 'comparison_grid' -> Sistema Frágil vs Sistema Resiliente e Antifrágil.
    - Slide 6: 'checklist_quest' -> Auditoria de Continuidade, Salvaguardas e Checkpoints Protegidos com XP.
    - Slide 7: 'decision_branch' -> Simulação de Falha Catastrófica e Escolha de Rota Segura de Contingência.
    - Slide 8: 'interactive_challenge' -> Quiz de Auditoria de Vulnerabilidade & Blindagem de Risco.
    - Slide 9+: 'epic_conclusion' OU 'bento_cards' -> Desfecho Dinâmico Adaptado (Fortaleza Blindada & Síntese de Antifragilidade Eterna, Bastião de Salvaguardas Permanentes ou Diretrizes de Continuidade Absoluta).`,
    endingVariations: 'O encerramento deve variar: Síntese de Fortaleza Blindada com Selo Antifrágil, Livro de Salvaguardas Permanentes, Matriz de Tolerância a Falhas ou Plano de Continuidade Operacional Inquebrável.',
    forbiddenPatterns: 'Proibido assumir cenários otimistas sem plano B, ausência de mapeamento de falhas/riscos ou falta de protocolos de contingência.',
  },
};

// Quantidade-alvo de slides varia por perfil BrainHex: todos os perfis geram
// no mínimo 9 slides (excedendo 8 slides com profundidade total) e expandem
// até 13-15 conforme a densidade do conteúdo recebido.
const PROFILE_SLIDE_TARGETS: Record<string, { min: number; max: number }> = {
  achiever: { min: 10, max: 15 },
  mastermind: { min: 10, max: 15 },
  seeker: { min: 9, max: 14 },
  socializer: { min: 9, max: 14 },
  survivor: { min: 9, max: 14 },
  conqueror: { min: 9, max: 13 },
  daredevil: { min: 9, max: 13 },
};
const DEFAULT_SLIDE_TARGET = { min: 9, max: 14 };

// Estimativa conservadora de chars de conteúdo-fonte por slide
const SLIDE_COUNT_CHARS_PER_SLIDE = 800;

// Configuração de batching segura para evitar estouro de tokens
const SLIDE_BATCH_SIZE = 2;
const SLIDE_BATCH_MAX_OUTPUT_TOKENS = 16384;
const SLIDE_BATCH_MAX_ATTEMPTS = 3;

// Schema de bloco para blocos subsequentes
const SLIDES_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: { slides: (DECK_RESPONSE_SCHEMA as any).properties.slides },
  required: ['slides'],
};

function resolveTargetSlideCount(
  targetProfile: string,
  sourceText: string,
  requestedSlideCount: unknown,
): number {
  const norm = String(targetProfile || '').trim().toLowerCase();
  const target = PROFILE_SLIDE_TARGETS[norm] || DEFAULT_SLIDE_TARGET;
  if (typeof requestedSlideCount === 'number' && requestedSlideCount > 0) {
    return Math.max(requestedSlideCount, target.min);
  }
  const contentLength = (String(sourceText || '').length || 0);
  const contentBased = Math.ceil(contentLength / SLIDE_COUNT_CHARS_PER_SLIDE);
  return Math.min(target.max, Math.max(target.min, contentBased, 9));
}

// 16384 (valor original) estourava mesmo em blocos de so 4-5 slides - log
// real de producao (2026-08-23) mostrou "[Batch 1-5]"/"[Batch 6-9]" (blocos
// pequenos) falhando com "Unterminated string in JSON" repetidamente. O
// schema por slide cresceu bastante desde que esse valor foi fixado
// (thematicStorytelling + characterGuide + interactiveType completo +
// aiDecorations + 2-4 paragrafos densos) - dobrado como correcao de alta
// confianca pela evidencia estatica; DIAGNOSTIC_LOG abaixo confirma
// finishReason=MAX_TOKENS (ou nao) na proxima ocorrencia real.
const DECK_SLIDE_GENERATION_MAX_OUTPUT_TOKENS = 32768;

// Gera o deck completo com suporte a mais de 8 slides (mínimo 9 a 14),
// fidelidade rigorosa ao conteúdo/anexos e preservação total de contexto.
async function generateDeckSlidesInBatches(params: {
  targetProfile: string;
  guideInfo: any;
  topic: string;
  classe: string;
  sourceText: string;
  narrativeStyle?: string;
  totalSlides: number;
  attachments?: any[];
  preferredModel?: string;
  rotateModels?: boolean;
  requestKeys?: string[];
  rankLevel?: string;
  audience?: string;
  personaBlueprintPreset?: string;
  personaSpecificPrompt?: string;
  customDirectives?: string;
}): Promise<{ deckMeta: any; slides: any[]; modelUsed?: string; keyIndexUsed?: number }> {
  const {
    targetProfile,
    guideInfo,
    topic,
    classe,
    sourceText,
    narrativeStyle,
    totalSlides,
    attachments = [],
    preferredModel = 'gemini-3.7-flash',
    rotateModels = true,
    requestKeys,
    rankLevel = 'Guardião',
    personaBlueprintPreset,
    personaSpecificPrompt,
    customDirectives,
  } = params;

  // Garante que a meta mínima de slides seja sempre >= 9
  const effectiveTotalSlides = Math.max(totalSlides || 9, 9);
  const systemPrompt = buildPedagogicalSystemPrompt(targetProfile, guideInfo, effectiveTotalSlides);

  const attachmentsListing = attachments.length > 0
    ? `
================================================================================
IMAGENS DE REFERÊNCIA ANEXADAS (índices 0 a ${attachments.length - 1}):
${attachments.map((a: any, i: number) => `[${i}] ${a.name || `imagem-${i}`}`).join('\n')}
================================================================================
`
    : '';

  const fullPrompt = `
================================================================================
REQUISIÇÃO OFICIAL DE GERAÇÃO PEDAGÓGICA TRAILUP BRAINHEX:
================================================================================
Tema Principal da Aula / Apresentação: "${topic || 'Material Educacional'}"
Classe / Turma / Audiência: ${classe || 'Turma Geral'}
Perfil Psicológico BrainHex: ${targetProfile.toUpperCase()}
Personagem Guia Oficial: ${guideInfo.name} (${guideInfo.title})
Voz & Tom do Guia: ${guideInfo.voice || 'Focado na psicologia do perfil'}
Ambientação & Cenário: ${guideInfo.environment || 'Universo temático do perfil'}
Rank da Trilha: ${rankLevel}
Total Mínimo de Slides a Gerar: ${effectiveTotalSlides} SLIDES (OBRIGATORIAMENTE ${effectiveTotalSlides} SLIDES, CADA UM COM UM SUBTÓPICO DIFERENTE)
${personaBlueprintPreset ? `Preset de Estrutura: "${personaBlueprintPreset}"` : ''}
${personaSpecificPrompt ? `\nInstruções Específicas do Perfil:\n${personaSpecificPrompt}\n` : ''}
${customDirectives ? `\nDiretrizes Personalizadas do Usuário:\n${customDirectives}\n` : ''}
${sourceText ? `\n================================================================================
CONTEÚDO-FONTE (BASE OBRIGATÓRIA PARA A GERAÇÃO DOS SLIDES):
${sourceText}
================================================================================\n` : ''}
${attachmentsListing}
${narrativeStyle ? `Estilo Narrativo: ${narrativeStyle}` : ''}

INSTRUÇÕES CRÍTICAS DE EXECUÇÃO:
1. GERE EXATAMENTE ${effectiveTotalSlides} SLIDES no array "slides", numerados sequencialmente de 1 a ${effectiveTotalSlides}.
2. STORYTELLING TEMÁTICO POR SLIDE: Cada slide DEVE conter o objeto "thematicStorytelling" com "storyArcPhase", "environmentSetting" (alinhado a: "${guideInfo.environment}"), "voiceTone" (alinhado a: "${guideInfo.voice}") e "narrativeBeat" (ponte narrativa de 1 a 2 frases conectando a ambientação ao tema técnico).
3. TEXTO SUBSTANCIAL & SEM RESUMOS CURTOS: Cada slide DEVE conter em "contentParagraphs" de 2 a 4 parágrafos densos, ricos em terminologia técnica real, causas e efeitos, mecanismos detalhados e explicações aprofundadas. Proibido conteúdo vazio ou simplificado.
4. ELEMENTO INTERATIVO ÚNICO POR SLIDE: Defina obrigatoriamente "interactiveType" em cada slide e preencha os dados completos correspondentes (quiz com justificativas, checklist com XP, decisionChoices com desfechos, secretLore com revelação, timelineSteps com etapas reais, metricCards com dados quantitativos, ou bentoCards com blocos modulares). Quiz: "question" objetiva em até 220 caracteres, cada "text" de opção em até 140 caracteres, cada "explanation" em até 260 caracteres — direto ao ponto, nunca repita a mesma ideia com palavras diferentes.
5. GUIA DO PERSONAGEM: Preencha "characterGuide" com a fala viva e imersiva de "${guideInfo.name}" contextualizando o conteúdo na sua voz e tom característicos.
6. VARIE O DESFECHO: Não termine com uma conclusão genérica. Adapte a conclusão ao perfil e ao enredo (boss battle, árvore de decisão, checklist de campo, códice arcano ou honraria).
7. IMAGENS DE REFERÊNCIA: Se houver imagens listadas em "IMAGENS DE REFERÊNCIA ANEXADAS" e alguma for diretamente relevante ao subtópico de um slide, preencha "referenceImageIndex" com o índice correspondente em vez de inventar uma descrição visual genérica para aquele slide. Se nenhuma imagem for relevante, omita o campo — não force um índice arbitrário. Quando a imagem original já é um bom exemplo visual (ex.: diagrama técnico já claro), deixe "restyleReferenceImage" de fora. Quando a imagem se beneficia de uma versão estilizada pro perfil (ex.: foto genérica, ilustração fora do tom do perfil), preencha "restyleReferenceImage": true — no máximo em 2-3 slides do deck inteiro, não em todos. DISTRIBUA o uso das imagens anexadas ao longo do deck inteiro: tente que cada imagem apareça em pelo menos um slide antes de repetir a mesma imagem numa segunda vez, especialmente entre subtópicos diferentes — não concentre o mesmo índice em vários slides enquanto outras imagens anexadas ainda não foram usadas em nenhum.
8. NO MÁXIMO UM COMPONENTE RICO POR SLIDE: preencha no máximo um entre "timelineSteps", "metricCards", "comparisonColumns" e "bentoCards" por slide — escolha o mais adequado ao conteúdo daquele subtópico específico, não gere vários simultaneamente.
9. Retorne EXCLUSIVAMENTE o JSON estruturado conforme o schema. Sem texto antes ou depois.
`;

  // Tentativa 1: Geração unificada completa
  let singlePassResult: Awaited<ReturnType<typeof generateWithKeyRotation>> | undefined;
  try {
    singlePassResult = await generateWithKeyRotation(systemPrompt, fullPrompt, {
      preferredModel,
      rotateModels,
      requestKeys,
      schema: DECK_RESPONSE_SCHEMA,
      maxOutputTokens: DECK_SLIDE_GENERATION_MAX_OUTPUT_TOKENS,
      attachments,
    });

    const parsed = JSON.parse(singlePassResult.text);
    if (parsed && Array.isArray(parsed.slides) && parsed.slides.length >= 6) {
      return {
        deckMeta: parsed,
        slides: parsed.slides,
        modelUsed: singlePassResult.modelUsed,
        keyIndexUsed: singlePassResult.keyIndexUsed,
      };
    }
  } catch (singleErr: any) {
    console.warn(
      `[Gemini Single-Pass] Falhou ou retornou incompleto (${singleErr.message}). Tentando em 2 blocos coordenados com persistência total de anexos...`,
      { finishReason: singlePassResult?.finishReason, usageMetadata: singlePassResult?.usageMetadata }
    );
  }

  // Tentativa 2: blocos ADAPTATIVOS. Quando a resposta trunca (MAX_TOKENS), o
  // unico caminho que muda o resultado e pedir MENOS slides - entao o bloco e
  // partido ao meio e devolvido a fila, nunca repetido igual. Repetir o mesmo
  // prompt so gastava ~78k tokens de entrada por tentativa, o que estourava a
  // cota do free tier e disparava 429 em cascata (log de producao 2026-08-24).
  let deckMeta: any = null;
  const slides: any[] = [];
  let lastModelUsed: string | undefined;
  let lastKeyIndexUsed: number | undefined;
  let houveTruncamento = false;
  let houveCotaEsgotada = false;

  const fila: SlideBatch[] = planSlideBatches(effectiveTotalSlides, DEFAULT_SLIDES_PER_BATCH);
  let primeiroBlocoPendente = true;

  while (fila.length > 0) {
    const b = fila.shift()!;
    const priorTitles = slides
      .map((s: any, i: number) => `${i + 1}. [${s.subtopic || 'Subtópico'}] ${s.title || 'Slide'}`)
      .join('\n');
    const isFirst = primeiroBlocoPendente;
    const isLast = fila.length === 0;

    const batchPrompt = `
${fullPrompt}

COORDENAÇÃO DE BLOCO:
${priorTitles ? `Slides já forjados nos blocos anteriores (NÃO repita os mesmos subtópicos, avance na progressão):
${priorTitles}
` : ''}

INSTRUÇÃO DO BLOCO:
Gere EXCLUSIVAMENTE os slides ${b.start + 1} a ${b.start + b.count} desta sequência (${b.count} slides densos e profundos).
${isLast ? `Este é o bloco final: inclua o clímax da aula e o desfecho dinâmico adaptado ao tema e ao perfil.` : `Desenvolva os fundamentos e etapas técnicas do conteúdo com máxima riqueza.`}
`;

    let genResult: Awaited<ReturnType<typeof generateWithKeyRotation>> | undefined;
    try {
      genResult = await generateWithKeyRotation(systemPrompt, batchPrompt, {
        preferredModel,
        rotateModels,
        requestKeys,
        schema: isFirst ? DECK_RESPONSE_SCHEMA : SLIDES_ONLY_SCHEMA,
        maxOutputTokens: DECK_SLIDE_GENERATION_MAX_OUTPUT_TOKENS,
        attachments, // SEMPRE passa todos os anexos em todos os blocos!
      });

      const parsed = JSON.parse(genResult.text);
      const batchSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
      if (batchSlides.length > 0) {
        if (isFirst) {
          deckMeta = parsed;
          primeiroBlocoPendente = false;
        }
        slides.push(...batchSlides);
        lastModelUsed = genResult.modelUsed;
        lastKeyIndexUsed = genResult.keyIndexUsed;
        continue;
      }
      throw new Error('bloco sem slides');
    } catch (err: any) {
      const truncou = isTruncationFailure({
        finishReason: genResult?.finishReason as string | undefined,
        errorMessage: err?.message,
      });
      const cota = /429|quota|RESOURCE_EXHAUSTED/i.test(String(err?.message ?? ''));
      houveTruncamento = houveTruncamento || truncou;
      houveCotaEsgotada = houveCotaEsgotada || cota;

      const partes = truncou ? splitBatch(b) : null;
      console.warn(
        `[Batch ${b.start + 1}-${b.start + b.count}] ${truncou ? 'resposta truncada' : 'erro'}: ${err?.message}` +
          (partes ? ` — dividindo em ${partes[0].count}+${partes[1].count} slides` : ' — bloco descartado'),
        { finishReason: genResult?.finishReason, usageMetadata: genResult?.usageMetadata }
      );

      // So volta pra fila quando da pra pedir MENOS: bloco de 1 slide que
      // trunca (ou erro que nao e de tamanho) nao melhora com nova tentativa.
      if (partes) fila.unshift(partes[0], partes[1]);
    }
  }

  if (slides.length >= 4) {
    return { deckMeta, slides, modelUsed: lastModelUsed, keyIndexUsed: lastKeyIndexUsed };
  }

  throw new Error(
    describeGenerationFailure({ truncou: houveTruncamento, cotaEsgotada: houveCotaEsgotada }),
  );
}

// Helper to build system prompt for a profile
function buildPedagogicalSystemPrompt(targetProfile: string, guideInfo: any, targetSlideMin: number) {
  const norm = String(targetProfile || '').trim().toLowerCase();
  const blueprint = PROFILE_STRUCTURAL_BLUEPRINTS[norm] || PROFILE_STRUCTURAL_BLUEPRINTS.achiever;

  return `
Você é o Grão-Mestre e Arquiteto Pedagógico do TrailUp e Engenheiro Chefe de Conteúdo Instrucional (unindo rigor pedagógico de excelência, narrativa temática imersiva e a psicologia cognitiva dos 7 perfis BrainHex).

================================================================================
DIRETRIZ MÁXIMA DE BASE NO CONTEÚDO FORNECIDO & IMERSÃO TOTAL:
================================================================================
1. FIDELIDADE ABSOLUTA E APROVEITAMENTO TOTAL DO CONTEÚDO ENVIADO:
   - A geração DEVE se basear rigorosamente no conteúdo enviado (seja via texto direto, anexos de arquivos, PDF, DOCX, código-fonte, notas de aula, apostilas ou parâmetros do microserviço).
   - Extraia TODOS os termos técnicos, regras de negócio, dados numéricos, etapas de processo, conceitos fundamentais, problemas, soluções e exemplos do material fornecido.
   - É terminantemente PROIBIDO gerar conteúdo genérico, vago ou descartar os elementos do texto de entrada. Cada slide deve abordar tópicos reais e específicos extraídos da fonte.
   - NUNCA invente assuntos genéricos quando houver material fornecido. Incorpore termos reais da matéria em cada parágrafo, subtópico e exemplo.

2. AMBIENTAÇÃO, ENREDO E STORYTELLING TEMÁTICO POR PERFIL:
   - Personagem Guia Oficial: "${guideInfo.name}" (${guideInfo.title})
   - Voz & Tom do Guia: "${guideInfo.voice}"
   - Ambientação & Cenário: "${guideInfo.environment}"
   - A ambientação temática e a voz do guia devem se fundir simbioticamente com os conceitos reais do conteúdo.
   - Cada slide deve incorporar o objeto "thematicStorytelling" contextualizando a fase do arco pedagógico, o cenário temático, o tom de voz e o beat narrativo que conecta a ambientação ao tema técnico.
   - Os elementos técnicos do conteúdo tornam-se as próprias ferramentas, artefatos, leis do universo, desafios táticos e salvaguardas da apresentação.

3. FLUXO PEDAGÓGICO CONSISTENTE & TEXTO SUBSTANCIAL:
   - A apresentação deve construir uma jornada de aprendizagem sólida, iniciando com o problema e contexto, progredindo pela desconstrução modular, comparação e aplicação, e culminando em maestria.
   - NENHUM slide deve ser superficial. "contentParagraphs" DEVE conter de 2 a 4 parágrafos densos, analíticos e explicativos, trazendo causas e efeitos, mecanismos reais e justificativas profundas.
   - NUNCA use resumos curtos de uma linha, bullet points vazios ou placeholders.

4. ELEMENTO INTERATIVO ÚNICO POR SLIDE:
   - CADA SLIDE deve possuir um elemento interativo com dados reais e técnicos preenchidos de acordo com "interactiveType":
     * 'quiz': Objeto "quiz" com pergunta instigante (até 220 caracteres), 3-4 opções (texto de cada opção até 140 caracteres) e "explanation" formativa objetiva em cada alternativa (até 260 caracteres) — conciso e direto, nunca repetitivo.
     * 'checklist': Array "checklist" com passos de validação técnica e valores de XP proporcionais à complexidade.
     * 'decision': Array "decisionChoices" com bifurcações táticas, trade-offs, justificativas e desfechos ("outcome").
     * 'secret_reveal': Objeto "secretLore" com dica intrigante ("hint") e revelação aprofundada da causa-raiz ("revealedContent").
     * 'code_inspect': Objeto "codeSnippet" com código-fonte funcional ou pseudocódigo técnico e anotações arquiteturais.
     * 'timeline_process': Array "timelineSteps" com etapas cronológicas detalhadas.
     * 'stats_metrics': Array "metricCards" com KPIs numéricos, tendências e benchmarks.
     * 'bento_cards': Array "bentoCards" com blocos modulares, tags e estatísticas.
     * 'comparison_grid': Array "comparisonColumns" com colunas comparativas e trade-offs.

================================================================================
ARQUITETURA PEDAGÓGICA EXCLUSIVA PARA O PERFIL "${targetProfile.toUpperCase()}" (${blueprint.namePt}):
================================================================================
ESTA APRESENTAÇÃO DEVE SER 100% CUSTOMIZADA PARA O ARQUÉTIPO COGNITIVO "${targetProfile.toUpperCase()}".
TÍTULO DA ARQUITETURA: "${blueprint.focusTitle}"
FILOSOFIA PEDAGÓGICA: "${blueprint.pedagogicalPhilosophy}"

SEQUÊNCIA ESTRUTURAL DE SLIDES PARA ESTE PERFIL:
${blueprint.mandatorySlideSequence}

VARIAÇÕES DE DESFECHO / CONCLUSÃO (NUNCA REPETIR O MESMO FINAL PADRÃO):
${blueprint.endingVariations}
- O encerramento da apresentação NÃO deve seguir um modelo engessado ou repetitivo. Escolha dinamicamente o formato e o tom de conclusão que melhor se harmonizem com o enredo desenvolvido e o conteúdo ensinado.

EXTENSÃO DE SLIDES OBRIGATÓRIA:
- A apresentação DEVE conter no mínimo ${targetSlideMin} slides completos (sempre mais de 8 slides, gerando ${targetSlideMin} slides).
- Cada slide deve cobrir UM subtópico específico ("subtopic"), avançando sequencialmente até esgotar todos os aspectos do conteúdo com riqueza e densidade.

RESTRIÇÕES E PADRÕES PROIBIDOS PARA ESTE PERFIL:
${blueprint.forbiddenPatterns}

================================================================================
ESTRUTURA OBRIGATÓRIA DE CADA SLIDE NO SCHEMA JSON (NUNCA RESUMA):
================================================================================
1. CADA SLIDE DEVE CONTER:
   - "subtopic": Título do subtópico específico coberto neste slide.
   - "title": Título chamativo, temático e tecnicamente preciso.
   - "subtitle": Subtítulo contextualizador e instigante.
   - "pedagogicalObjective": Objetivo pedagógico claro e mensurável a ser conquistado neste slide.
   - "thematicStorytelling": Objeto { "storyArcPhase": "...", "environmentSetting": "${guideInfo.environment}", "voiceTone": "${guideInfo.voice}", "narrativeBeat": "..." }.
   - "contentParagraphs": De 2 a 4 parágrafos densos, ricos e explicativos, trazendo conceitos reais, causas e efeitos, mecanismos e justificativas profundas.
   - "characterGuide": Objeto com { "name": "${guideInfo.name}", "speechText": "...", "analogy": "..." } onde o personagem guia interage diretamente com o conteúdo usando analogias ricas na voz "${guideInfo.voice}".
   - "writtenExample": Objeto com { "title": "...", "explanation": "...", "codeOrDiagram": "...", "visualIcon": "..." } contendo um exemplo prático real do assunto.
   - "keyTakeaways": Lista de 2 a 4 pontos de maestria fundamentais.
   - "interactiveType": Tipo de interação do slide ('quiz' | 'checklist' | 'decision' | 'secret_reveal' | 'code_inspect' | 'none').

2. ELEMENTOS VISUAIS E INFOGRÁFICOS:
   - Preencha elementos temáticos ricos nos slides pertinentes: "timelineSteps", "metricCards", "comparisonColumns", "bentoCards", "stickyNote", "secretLore" e "quiz".

3. DIREÇÃO DE ARTE & ÍCONE SVG POR SLIDE ("aiDecorations"):
   - Gere para cada slide o objeto "aiDecorations" com "medievalClassArchetype", "medievalPromptDescription" e "customIconSvg" (SVG puro viewBox="0 0 100 100").

4. PROIBIÇÃO TOTAL DE EMOJIS:
   - É expressamente PROIBIDO o uso de emojis em QUALQUER campo de texto. O visual é sofisticado, limpo e profissional.

Retorne APENAS um objeto JSON válido estritamente de acordo com o schema DECK_RESPONSE_SCHEMA.
`;
}

// API: AI Deck Generator (Single or Batch Profile with Multimodal & Dynamic Slide Count)
app.post('/api/generate-deck', async (req: Request, res: Response) => {
  try {
    const {
      topic = '',
      sourceText = '',
      targetProfile,
      rankLevel = 'Guardião',
      classe = 'Turma-Geral',
      slideCount = 'auto', // 'auto' or number
      slideCountMode = 'auto', // 'auto' | 'custom'
      narrativeStyle = 'balanced', // 'rpg-story' | 'practical-technical' | 'balanced'
      customDirectives = '',
      personaBlueprintPreset = '',
      personaSpecificPrompt = '',
      audience = 'Estudantes e Profissionais de Tecnologia',
      preferredModel = 'gemini-3.7-flash',
      rotateModels = true,
      customApiKeys = [],
      attachments = [],
    } = req.body;

    if (!targetProfile) {
      return res.status(400).json({ error: 'targetProfile is required.' });
    }

    const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
    const hasSourceText = typeof sourceText === 'string' && sourceText.trim().length > 0;

    if (!topic && !hasAttachment && !hasSourceText) {
      return res.status(400).json({ error: 'Informe um tema ou envie um arquivo/texto base para a geração.' });
    }

    const manualSlideCount = typeof slideCount === 'number' ? slideCount : parseInt(slideCount as string, 10);
    const requestedCount = slideCountMode === 'custom' && !isNaN(manualSlideCount) && manualSlideCount > 0 ? manualSlideCount : undefined;
    const targetSlideMin = resolveTargetSlideCount(targetProfile, sourceText, requestedCount);

    const guideInfo = getGuideForProfile(targetProfile);

    // Geração em batches para garantir mais de 8 slides sem truncamento JSON
    const batched = await generateDeckSlidesInBatches({
      targetProfile,
      guideInfo,
      topic: topic || 'Material Educacional',
      classe,
      sourceText,
      narrativeStyle,
      totalSlides: targetSlideMin,
      attachments,
      preferredModel,
      rotateModels,
      requestKeys: customApiKeys,
      rankLevel,
      audience,
      personaBlueprintPreset,
      personaSpecificPrompt,
      customDirectives,
    });

    const rawData = { ...(batched.deckMeta || {}), slides: batched.slides };
    
    // Resolve referências de imagem (reutilização de anexos, restilização com IA ou geração temática por subtópico)
    const imageAttachments: ImageAttachment[] = Array.isArray(attachments)
      ? attachments
          .filter((a: any) => a && (a.dataBase64 || a.data))
          .map((a: any) => ({
            mimeType: a.mimeType || a.type || 'image/png',
            dataBase64: a.dataBase64 || a.data || '',
            name: a.name,
          }))
      : [];
    const resolvedSlides = await resolveSlideIllustrations(
      batched.slides,
      imageAttachments,
      generateSlideIllustration,
      { targetProfile, topic: topic || 'Material Educacional' }
    );
    rawData.slides = resolvedSlides;

    const interactiveEnriched = enrichDeckWithInteractiveElements(rawData as any);
    const visuallyEnriched = enrichDeckWithVisualReferences(
      interactiveEnriched as any,
      typeof sourceText === 'string' ? sourceText : ''
    );
    const generatedData = stripEmojis(visuallyEnriched);

    return res.json({
      success: true,
      deck: generatedData,
      meta: {
        keyIndexUsed: batched.keyIndexUsed,
        modelUsed: batched.modelUsed,
        slideCountGenerated: generatedData.slides?.length || 0,
        characterGuide: guideInfo.name,
      },
    });
  } catch (error: any) {
    console.error('Error generating deck with Gemini:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao gerar o deck com IA.',
    });
  }
});

// API Microservice: GET /api/v1/profiles - List all 7 BrainHex Guide Personas
app.get('/api/v1/profiles', (req: Request, res: Response) => {
  const list = Object.entries(BRAINHEX_GUIDES).map(([id, info]) => ({
    id,
    namePt: info.namePt,
    guideName: info.name,
    title: info.title,
    quote: info.quote,
    description: info.description,
    traits: info.traits,
    archetype: info.archetype,
    color: info.color,
  }));

  return res.json({
    success: true,
    total: list.length,
    profiles: list,
  });
});

// API Microservice: GET /api/v1/profiles/:profileId - Get Single Profile Info
app.get('/api/v1/profiles/:profileId', (req: Request, res: Response) => {
  const profileId = String(req.params.profileId || '').trim().toLowerCase();
  const profile = BRAINHEX_GUIDES[profileId];

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: `Perfil '${profileId}' não encontrado. Disponíveis: ${Object.keys(BRAINHEX_GUIDES).join(', ')}`,
    });
  }

  return res.json({
    success: true,
    profileId,
    ...profile,
  });
});

// API Microservice: POST /api/v1/prompt-preview - Inspect Pedagogical Prompts
app.post('/api/v1/prompt-preview', (req: Request, res: Response) => {
  try {
    const {
      topic = 'Exemplo de Tópico',
      targetProfile = 'mastermind',
      sourceText = '',
      slideCount = 'auto',
      rankLevel = 'Guardião',
    } = req.body;

    const guideInfo = getGuideForProfile(targetProfile);
    const manualCount = typeof slideCount === 'number' ? slideCount : parseInt(slideCount as string, 10);
    const requestedCount = !isNaN(manualCount) && manualCount > 0 ? manualCount : undefined;
    const targetSlideMin = resolveTargetSlideCount(targetProfile, sourceText, requestedCount);
    const systemPrompt = buildPedagogicalSystemPrompt(targetProfile, guideInfo, targetSlideMin);

    const userPrompt = `
Tema Principal: "${topic}"
${sourceText ? `\n--- CONTEÚDO FORNECIDO PELO USUÁRIO ---\n${sourceText}\n--- FIM DO CONTEÚDO ---\n` : ''}
Perfil BrainHex Alvo: ${targetProfile}
Personagem Guia: ${guideInfo.name} (${guideInfo.title})
Nível de Rank: ${rankLevel}
Meta de Slides: Gere OBRIGATORIAMENTE uma sequência completa e expandida de pelo menos ${targetSlideMin} slides densos, ricos e altamente imersivos sobre o tema "${topic}".
`;

    return res.json({
      success: true,
      targetProfile,
      characterGuide: guideInfo,
      targetSlideMin,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      estimatedTokens: Math.round((systemPrompt.length + userPrompt.length) / 4),
      systemPrompt,
      userPrompt,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API Microservice: POST /api/v1/generate - Full Microservice Generation
app.post('/api/v1/generate', async (req: Request, res: Response) => {
  try {
    const {
      topic,
      sourceText = '',
      targetProfile,
      classe = 'Turma-Geral',
      slideCount = 'auto',
      attachments = [],
      preferredModel = 'gemini-3.7-flash',
      autoSaveSupabase = false,
      supabaseUrl,
      supabaseAnonKey,
      supabaseBucket = 'conteudo_aluno',
      rankLevel = 'Guardião',
      narrativeStyle = 'balanced',
      personaBlueprintPreset = '',
      personaSpecificPrompt = '',
      customDirectives = '',
    } = req.body;

    if (!targetProfile) {
      return res.status(400).json({ success: false, error: 'targetProfile é obrigatório.' });
    }

    const guideInfo = getGuideForProfile(targetProfile);
    const manualCount = typeof slideCount === 'number' ? slideCount : parseInt(slideCount as string, 10);
    const requestedCount = !isNaN(manualCount) && manualCount > 0 ? manualCount : undefined;
    const targetSlideMin = resolveTargetSlideCount(targetProfile, sourceText, requestedCount);

    // Geração em batches para suportar > 8 slides com robustez total
    const batched = await generateDeckSlidesInBatches({
      targetProfile,
      guideInfo,
      topic: topic || 'Material Educacional',
      classe,
      sourceText,
      narrativeStyle,
      totalSlides: targetSlideMin,
      attachments,
      preferredModel,
      rankLevel,
      personaBlueprintPreset,
      personaSpecificPrompt,
      customDirectives,
    });

    const rawDeck = { ...(batched.deckMeta || {}), slides: batched.slides };
    
    // Resolve referências de imagem (reutilização de anexos, restilização com IA ou geração temática por subtópico)
    const imageAttachments: ImageAttachment[] = Array.isArray(attachments)
      ? attachments
          .filter((a: any) => a && (a.dataBase64 || a.data))
          .map((a: any) => ({
            mimeType: a.mimeType || a.type || 'image/png',
            dataBase64: a.dataBase64 || a.data || '',
            name: a.name,
          }))
      : [];
    const resolvedSlides = await resolveSlideIllustrations(
      batched.slides,
      imageAttachments,
      generateSlideIllustration,
      { targetProfile, topic: topic || 'Material Educacional' }
    );
    rawDeck.slides = resolvedSlides;

    const interactiveDeck = enrichDeckWithInteractiveElements(rawDeck as any);
    const visuallyEnrichedDeck = enrichDeckWithVisualReferences(
      interactiveDeck as any,
      typeof sourceText === 'string' ? sourceText : ''
    );
    const deckData = stripEmojis(visuallyEnrichedDeck);
    deckData.classe = classe;
    deckData.characterGuideName = guideInfo.name;

    let supabaseSaveResult = null;
    const finalUrl = supabaseUrl || process.env.SUPABASE_URL;
    const finalKey = supabaseAnonKey || process.env.SUPABASE_ANON_KEY;

    if (autoSaveSupabase && finalUrl && finalKey) {
      try {
        const supabase = createClient(finalUrl, finalKey);
        const cleanProfile = String(targetProfile).toLowerCase();
        const cleanTopic = String(topic || 'aula').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const cleanClasse = String(classe).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const basePath = `${cleanProfile}/${cleanTopic}/${cleanClasse}`;

        // Save deck JSON
        await supabase.storage.from(supabaseBucket).upload(
          `${basePath}/deck_${Date.now()}.json`,
          Buffer.from(JSON.stringify(deckData, null, 2)),
          { contentType: 'application/json', upsert: true }
        );

        supabaseSaveResult = {
          saved: true,
          bucket: supabaseBucket,
          path: basePath,
        };
      } catch (err: any) {
        console.error('AutoSave Supabase Error:', err);
        supabaseSaveResult = { saved: false, error: err.message };
      }
    }

    return res.json({
      success: true,
      deck: deckData,
      characterGuide: guideInfo,
      supabase: supabaseSaveResult,
      meta: {
        modelUsed: batched.modelUsed,
        keyIndexUsed: batched.keyIndexUsed,
        slideCountGenerated: deckData.slides?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('Microservice generate error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API Microservice: POST /api/v1/render-and-store — gera o deck, renderiza
// o HTML completo (generateInteractiveHtml, antes só usada no frontend) e
// sobe o arquivo no Supabase Storage no bucket/path informados pelo
// chamador. Não escreve em nenhuma tabela — quem persiste em
// conteudo_personalizado é o microservice do trailup (ver
// docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md).
app.post('/api/v1/render-and-store', requireSecret, async (req: Request, res: Response) => {
  try {
    const {
      targetProfile,
      topic,
      sourceText,
      classe = 'Turma-Geral',
      narrativeStyle,
      // Sem default aqui de propósito: precisa diferenciar "não enviado" (o
      // microservice do trailup nunca manda slideCount hoje) de "enviado
      // explicitamente" - resolveTargetSlideCount só respeita um override
      // explícito quando slideCount é um number > 0.
      slideCount,
      bucket,
      storagePath,
      personalizacaoId,
      cicloId,
      sourceHash,
      ordem = 1,
      totalPartes = 1,
      presentationVersionMetadata,
      attachments,
    } = req.body;

    // Só imagens sobrevivem (áudio/pdf/etc. não fazem sentido como
    // attachment multimodal aqui) e só entradas bem formadas - entradas
    // malformadas são silenciosamente descartadas em vez de derrubar a
    // requisição inteira.
    const imageAttachments: ImageAttachment[] = Array.isArray(attachments)
      ? attachments.filter(
          (a: any): a is ImageAttachment =>
            a && typeof a.mimeType === 'string' && typeof a.dataBase64 === 'string' && a.mimeType.startsWith('image/')
        )
      : [];

    // Presente so quando o chamador (microservice do trailup) manda os
    // dados de fencing - requisicoes sem eles (ex.: /api/generate-deck, ou
    // qualquer chamador antigo) continuam funcionando exatamente como
    // antes, so sem persistencia no banco (dbWritten: false).
    const hasFence = personalizacaoId !== undefined && cicloId && sourceHash && presentationVersionMetadata;

    // bucket/storagePath do request NAO sao usados por persistApresentacaoResult
    // no caminho de falha (presentationUrl:null zera os dois na entrada
    // gravada) - seguro chamar mesmo quando ausentes/invalidos aqui.
    const persistValidateFailure = async (error: string) => {
      if (!hasFence) return false;
      const persistResult = await persistApresentacaoResult(getServiceRoleClient() as unknown as SupabaseClientLike, {
        fence: { personalizacaoId, cicloId, sourceHash },
        versionMetadata: presentationVersionMetadata,
        bucket: bucket ?? '',
        storagePath: storagePath ?? '',
        presentationUrl: null,
        failure: { stage: 'validate', error },
        ordem,
        totalPartes,
        titulo: topic,
      });
      return persistResult.dbWritten;
    };

    const validation = validateRenderAndStoreInput({ targetProfile, bucket, storagePath });
    if (!validation.ok) {
      const error = validation.error ?? 'Entrada inválida.';
      const dbWritten = await persistValidateFailure(error);
      return res.status(400).json({ success: false, stage: 'validate', error, dbWritten });
    }
    const { capitalizedProfile, theme } = validation;

    const guideInfo = getGuideForProfile(targetProfile);
    const targetSlideMin = resolveTargetSlideCount(targetProfile, sourceText, slideCount);

    let deckMeta: any;
    let generatedSlides: any[];
    let modelUsed: string | undefined;
    // So preenchido quando nao ha attachment do professor - o TrailUp
    // (microservice) usa isso como fallback de imagem no markdown/audio do
    // topico, reaproveitando a MESMA imagem gerada por IA que os slides
    // usam, em vez de deixar o material sem imagem quando ninguem anexou
    // nada. Ver docs/superpowers/specs/
    // 2026-08-24-imagem-gerada-fallback-markdown-audio-design.md.
    let generatedImagesBySubtopic: Record<string, string> = {};
    try {
      const batched = await generateDeckSlidesInBatches({
        targetProfile,
        guideInfo,
        topic,
        classe,
        sourceText,
        narrativeStyle,
        totalSlides: targetSlideMin,
        attachments: imageAttachments,
      });
      deckMeta = batched.deckMeta;
      generatedSlides = await resolveSlideIllustrations(
        batched.slides,
        imageAttachments,
        generateSlideIllustration,
        { targetProfile, topic }
      );
      modelUsed = batched.modelUsed;
      generatedImagesBySubtopic = extractGeneratedImagesBySubtopic(generatedSlides);
    } catch (err: any) {
      let dbWritten = false;
      if (hasFence) {
        const persistResult = await persistApresentacaoResult(getServiceRoleClient() as unknown as SupabaseClientLike, {
          fence: { personalizacaoId, cicloId, sourceHash },
          versionMetadata: presentationVersionMetadata,
          bucket,
          storagePath,
          presentationUrl: null,
          failure: { stage: 'generate', error: err.message },
          ordem,
          totalPartes,
          titulo: topic,
        });
        dbWritten = persistResult.dbWritten;
      }
      return res.status(502).json({ success: false, stage: 'generate', error: err.message, dbWritten });
    }

    // Enrichers depend on the resolved profile/theme. Supplying them only
    // after enrichment made interactions fall back to Achiever and emitted
    // visual copy such as "Para o perfil undefined".
    const deckForEnrichment = {
      ...(deckMeta || {}),
      targetProfile: capitalizedProfile,
      themeConfig: theme,
      slides: generatedSlides,
    } as any;
    const interactiveDeck = enrichDeckWithInteractiveElements(deckForEnrichment);
    // enrichDeckWithVisualReferences (generic keyword-matched visualDiagram)
    // is intentionally NOT called here: generateInteractiveHtml never reads
    // visualDiagram/visualExamples, so that computation never reached the
    // student.
    const slidesWithCheckpoints = insertReflectionCheckpoints(interactiveDeck.slides);
    const deckData = stripEmojis({ ...interactiveDeck, slides: slidesWithCheckpoints });

    const fullDeck: any = {
      ...deckData,
      id: `deck-${Date.now()}`,
      title: deckData.title || topic || 'Apresentação TrailUp',
      subtitle: deckData.subtitle || `Trilha de ${theme.archetype}`,
      subject: deckData.subject || topic || 'Geral',
      targetProfile: capitalizedProfile,
      rankLevel: deckData.rankLevel || 'Guardião',
      themeConfig: theme,
      createdAt: new Date().toISOString().split('T')[0],
      author: 'TrailUp AI Master',
      estimatedMinutes: deckData.estimatedMinutes || (deckData.slides?.length || 5) * 2,
      tags: deckData.tags || [topic || 'Conteúdo', capitalizedProfile, 'TrailUp'],
      // generateInteractiveHtml faz .map() direto em checklist/decisionChoices/
      // timelineSteps/metricCards/bentoCards sem checar undefined - nenhum
      // desses campos e obrigatorio no DECK_RESPONSE_SCHEMA por slide.type,
      // entao um slide estruturalmente valido pode omitir o array esperado
      // pelo seu proprio tipo e derrubar o render com TypeError. Default
      // pra array vazio neutraliza essa classe de falha nao-deterministica.
      slides: (deckData.slides || []).map((s: any, i: number) => ({
        ...s,
        id: s.id || `slide-${i + 1}`,
        checklist: s.checklist ?? [],
        decisionChoices: s.decisionChoices ?? [],
        timelineSteps: s.timelineSteps ?? [],
        metricCards: s.metricCards ?? [],
        bentoCards: s.bentoCards ?? [],
        // generateInteractiveHtml (pós-abfcea5) também faz .map() direto em
        // contentParagraphs em vários branches sem checar undefined — mesma
        // classe de falha não-determinística do comentário acima, agora
        // coberta pros dois campos novos introduzidos nesse commit.
        contentParagraphs: s.contentParagraphs ?? [],
        keyTakeaways: s.keyTakeaways ?? [],
      })),
    };

    // Rede de seguranca contra loop de repeticao do modelo em quiz.question/
    // options[].text/explanation (e o mesmo shape em interactiveElement.
    // quizOptions) - ver src/utils/quizSanitize.ts. Roda ANTES da paginacao
    // por densidade pra que o peso do slide (proximo commit) ja reflita o
    // texto truncado, nao o bruto.
    fullDeck.slides = sanitizeQuizContent(fullDeck.slides);
    // Corrige o vies do modelo de sempre colocar a resposta certa na
    // primeira alternativa - ver shuffleQuizOptions em quizSanitize.ts.
    fullDeck.slides = shuffleQuizOptions(fullDeck.slides);
    fullDeck.slides = paginateSlidesByDensity(fullDeck.slides);
    // Extrai o widget de reflexao/acao do slide final pro seu proprio slide -
    // ver src/utils/finalReflectionSlide.ts. Roda depois da paginacao (o
    // slide final ja esta na sua forma definitiva) e antes do render.
    fullDeck.slides = extractFinalReflectionIntoOwnSlide(fullDeck.slides);

    let html: string;
    try {
      html = generateInteractiveHtml(fullDeck);
    } catch (err: any) {
      let dbWritten = false;
      if (hasFence) {
        const persistResult = await persistApresentacaoResult(getServiceRoleClient() as unknown as SupabaseClientLike, {
          fence: { personalizacaoId, cicloId, sourceHash },
          versionMetadata: presentationVersionMetadata,
          bucket,
          storagePath,
          presentationUrl: null,
          failure: { stage: 'render', error: err.message },
          ordem,
          totalPartes,
          titulo: topic,
        });
        dbWritten = persistResult.dbWritten;
      }
      return res.status(502).json({ success: false, stage: 'render', error: err.message, dbWritten });
    }

    try {
      const supabase = getServiceRoleClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, Buffer.from(html, 'utf-8'), {
          contentType: 'text/html; charset=utf-8',
          upsert: true,
        });
      if (uploadError) {
        let dbWritten = false;
        if (hasFence) {
          const persistResult = await persistApresentacaoResult(supabase as unknown as SupabaseClientLike, {
            fence: { personalizacaoId, cicloId, sourceHash },
            versionMetadata: presentationVersionMetadata,
            bucket,
            storagePath,
            presentationUrl: null,
            failure: { stage: 'upload', error: uploadError.message },
            ordem,
            totalPartes,
            titulo: topic,
          });
          dbWritten = persistResult.dbWritten;
        }
        return res.status(502).json({ success: false, stage: 'upload', error: uploadError.message, dbWritten });
      }
      // Não usamos supabase.storage.getPublicUrl() aqui: o gateway público do
      // Supabase Storage serve arquivos .html sempre como text/plain +
      // Content-Security-Policy: sandbox (proteção anti-XSS da própria
      // plataforma, não configurável por bucket — confirmado manualmente,
      // mimetype correto no metadata do objeto não muda o Content-Type
      // devolvido). Isso quebra o WebView do mobile, que precisa de
      // text/html de verdade pra executar o deck interativo. Servimos
      // através do endpoint próprio abaixo (GET /api/v1/decks/:bucket/*),
      // que baixa via service role e devolve o Content-Type certo.
      const deckUrl = buildAppUrl(req, `/api/v1/decks/${encodeURIComponent(bucket)}/${storagePath}`);
      let dbWritten = false;
      if (hasFence) {
        const persistResult = await persistApresentacaoResult(supabase as unknown as SupabaseClientLike, {
          fence: { personalizacaoId, cicloId, sourceHash },
          versionMetadata: presentationVersionMetadata,
          bucket,
          storagePath,
          presentationUrl: deckUrl,
          failure: null,
          ordem,
          totalPartes,
          titulo: topic,
        });
        dbWritten = persistResult.dbWritten;
      }
      return res.json({
        success: true,
        url: deckUrl,
        storage_path: storagePath,
        bucket,
        slide_count: fullDeck.slides.length,
        model_used: modelUsed,
        dbWritten,
        ...(Object.keys(generatedImagesBySubtopic).length > 0 ? { generatedImagesBySubtopic } : {}),
      });
    } catch (err: any) {
      let dbWritten = false;
      if (hasFence) {
        const persistResult = await persistApresentacaoResult(getServiceRoleClient() as unknown as SupabaseClientLike, {
          fence: { personalizacaoId, cicloId, sourceHash },
          versionMetadata: presentationVersionMetadata,
          bucket,
          storagePath,
          presentationUrl: null,
          failure: { stage: 'upload', error: err.message },
          ordem,
          totalPartes,
          titulo: topic,
        });
        dbWritten = persistResult.dbWritten;
      }
      return res.status(502).json({ success: false, stage: 'upload', error: err.message, dbWritten });
    }
  } catch (error: any) {
    console.error('render-and-store error:', error);
    return res.status(500).json({ success: false, stage: 'unknown', error: error.message });
  }
});

// API Microservice: POST /api/v1/supabase/sync (Direct sync endpoint)
app.post('/api/v1/supabase/sync', async (req: Request, res: Response) => {
  try {
    const {
      url,
      anonKey,
      bucketName = 'conteudo_aluno',
      perfil,
      topico,
      classe = 'turma_geral',
      deckJson,
      markdownText,
      audioScriptText,
    } = req.body;

    const finalUrl = url || process.env.SUPABASE_URL;
    const finalKey = anonKey || process.env.SUPABASE_ANON_KEY;

    if (!finalUrl || !finalKey) {
      return res.status(400).json({
        success: false,
        error: 'Configure a URL e Anon Key do Supabase.',
      });
    }

    const supabase = createClient(finalUrl, finalKey);
    const cleanPerfil = String(perfil || 'geral').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanTopico = String(topico || 'assunto').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanClasse = String(classe || 'turma').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const folderPath = `${cleanPerfil}/${cleanTopico}/${cleanClasse}`;

    const uploaded: Record<string, string> = {};

    if (deckJson) {
      const content = typeof deckJson === 'string' ? deckJson : JSON.stringify(deckJson, null, 2);
      const filePath = `${folderPath}/deck_${timestamp}.json`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(content, 'utf-8'), {
        contentType: 'application/json',
        upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploaded['deckJson'] = pub?.publicUrl || filePath;
      }
    }

    if (markdownText) {
      const filePath = `${folderPath}/aula_${timestamp}.md`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(markdownText, 'utf-8'), {
        contentType: 'text/markdown',
        upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploaded['markdown'] = pub?.publicUrl || filePath;
      }
    }

    if (audioScriptText) {
      const filePath = `${folderPath}/audio_roteiro_${timestamp}.txt`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(audioScriptText, 'utf-8'), {
        contentType: 'text/plain',
        upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploaded['audioScript'] = pub?.publicUrl || filePath;
      }
    }

    return res.json({
      success: true,
      bucket: bucketName,
      folderPath,
      uploaded,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Medieval Archetype Matrix for BrainHex Profiles
function getMedievalArchetypeDetails(profile: string) {
  const p = (profile || '').toLowerCase();
  if (p.includes('achiever')) {
    return {
      classArchetype: 'Paladino da Ordem & Alvorada Dourada',
      themeElements: 'Filigranas barrocas reais, brasões triunfais, louros de ouro, cetros e cálices da vitória',
      borderMotif: 'Moldura dourada esculpida com cantoneiras de flor-de-lis e brasões heráldicos reais',
      dividerMotif: 'Fita dourada de honra com diamante heráldico central e folhas de louro',
      iconMotif: 'Cálice sagrado da vitória coroado com louros e sol radiante',
      preset: 'ornate_gold',
      corner: 'star',
    };
  }
  if (p.includes('seeker')) {
    return {
      classArchetype: 'Cartógrafo Místico & Rastreador de Códices',
      themeElements: 'Pergaminho iluminado antigo, astrolábio astronômico, nós celtas entrelaçados, rosas dos ventos e runas de navegação',
      borderMotif: 'Moldura de pergaminho antigo com nós de trevo celtas nos 4 cantos e constelações gravadas',
      dividerMotif: 'Linha de bússola náutica com astrolábio central e runas antigas',
      iconMotif: 'Astrolábio com bússola rúnica mística e agulha imantada estelar',
      preset: 'runic_magic',
      corner: 'rune',
    };
  }
  if (p.includes('survivor')) {
    return {
      classArchetype: 'Guardião da Bastilha & Sentinela de Ferro',
      themeElements: 'Cantaria de pedra pesada de castelo, grades de ferro fundido, seteiras de vigília, correntes e escudos de torre',
      borderMotif: 'Borda fortificada de cantaria de pedra com rebites de ferro e baluartes angulares',
      dividerMotif: 'Barreira de estacas de ferro com escudo de torre central e correntes blindadas',
      iconMotif: 'Escudo de torre encouraçado com cruz de ferro forjado e rebites pesados',
      preset: 'astral_geometric',
      corner: 'shield',
    };
  }
  if (p.includes('daredevil')) {
    return {
      classArchetype: 'Cavaleiro Dragão & Berserker Flamejante',
      themeElements: 'Escamas de dragão negro, asas e garras forjadas, lâminas em brasa, centelhas de fogo vulcânico e machados duplos',
      borderMotif: 'Moldura de ferro forjado com garras de dragão e chamas entalhadas nos cantos',
      dividerMotif: 'Lâmina flamejante duelista com centelhas de fogo e runa vulcânica central',
      iconMotif: 'Cabeça de dragão cuspindo chamas entre dois machados de batalha cruzados',
      preset: 'cyber_neon',
      corner: 'flame',
    };
  }
  if (p.includes('mastermind')) {
    return {
      classArchetype: 'Arquimago Hermético & Alquimista da Torre',
      themeElements: 'Círculos de transmutação hermética, runas arcanas luminosas, esferas armilares, fórmulas esotéricas e grimórios',
      borderMotif: 'Círculos astronômicos transmutatórios com fórmulas herméticas e esferas armilares nos 4 cantos',
      dividerMotif: 'Feixe de energia arcana com pentagrama alquímico central e constelações',
      iconMotif: 'Grimório arcano aberto flutuando com olho místico do saber infinito',
      preset: 'astral_geometric',
      corner: 'rune',
    };
  }
  if (p.includes('conqueror')) {
    return {
      classArchetype: 'Senhor da Guerra & Estrategista Imperial',
      themeElements: 'Estandartes de legião imperial, pontas de lança de infantaria, coroas de ferro de soberania e águias de guerra',
      borderMotif: 'Borda imperial com estandartes bélicos e pontas de lança de aço nos cantos',
      dividerMotif: 'Lanças imperiais cruzadas com águia de guerra central e coroa de ferro',
      iconMotif: 'Elmo de cavaleiro imperial com plumas de comando e águia imperial coroada',
      preset: 'ornate_gold',
      corner: 'shield',
    };
  }
  // Socializer
  return {
    classArchetype: 'Bardo da Távola Redonda & Mestre da Guilda',
    themeElements: 'Arcos góticos de carvalho, laços de união de cavaleiros, harpas trovadorescas, taças de hidromel e brasões da távola',
    borderMotif: 'Arcos góticos de taberna com laços de aliança de guilda e folhas de carvalho nos cantos',
    dividerMotif: 'Fita de aliança de cavalaria com dois canecos de hidromel brindando e laços fraternos',
    iconMotif: 'Três espadas apontadas para o centro da távola com harpa de bardo e taça de aliança',
    preset: 'eco_vine',
    corner: 'leaf',
  };
}

// API: AI Slide Decoration & Medieval Visual Prompt Generator
app.post('/api/generate-slide-decorations', async (req: Request, res: Response) => {
  try {
    const {
      slideTitle = 'Tópico de Aprendizagem',
      slideConcept = '',
      slideSubtopic = '',
      targetProfile = 'Mastermind',
      archetype = 'medieval-rpg',
      primaryColor = '#7C3AED',
      accentColor = '#F59E0B',
      preferredModel = 'gemini-3.7-flash',
    } = req.body;

    const medievalDetails = getMedievalArchetypeDetails(targetProfile);

    const systemPrompt = `
Você é o Mestre Iluminador Medieval & Engenheiro de Arte Vetorial do TrailUp BrainHex.
Sua missão é gerar um Sistema Completo de Decoração Medieval Vetorial para o slide "${slideTitle}".

ARQUÉTIPO MEDIEVAL BRAINHEX:
- Perfil: "${targetProfile}"
- Classe: "${medievalDetails.classArchetype}"
- Elementos Chave: ${medievalDetails.themeElements}
- Referência de Moldura: ${medievalDetails.borderMotif}
- Referência de Divisor: ${medievalDetails.dividerMotif}
- Referência de Brasão/Ícone: ${medievalDetails.iconMotif}

REGRAS ESTRITAS DE SVG:
1. "customIconSvg":
   - Deve ser <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">...</svg>.
   - Sem texto interno.
   - Use formas heráldicas, linhas expressivas (stroke="currentColor", stroke-width="2"), e preenchimentos sutis (fill="currentColor" fill-opacity="0.2").
   - Ilustre o brasão ou ícone medieval contextualizando o conceito "${slideTitle}".
2. "customBorderSvg":
   - Deve ser <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">...</svg>.
   - Contém 4 cantoneiras heráldicas (top-left, top-right, bottom-left, bottom-right) e moldura perimétrica detalhada (stroke="currentColor", stroke-width="1.8").
3. "customDividerSvg":
   - Deve ser <svg viewBox="0 0 600 40" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">...</svg>.
   - Contém um divisor decorativo horizontal central com adorno medieval, fitas, nós celtas, lanças ou símbolos arcanos conectando as extremidades (stroke="currentColor").
4. "medievalPromptDescription":
   - Descrição rica e poética do conceito artístico medieval gerado para a iluminação deste slide.
5. "medievalClassArchetype": "${medievalDetails.classArchetype}".
6. "borderDescription": Descrição da moldura.
7. "dividerDescription": Descrição do divisor.
8. "iconDescription": Descrição do brasão/ícone.

Retorne APENAS um JSON válido de acordo com o schema.
`;

    const userPrompt = `
Slide: "${slideTitle}"
Subtópico: "${slideSubtopic || slideConcept || slideTitle}"
Perfil BrainHex: ${targetProfile}
Classe Medieval: ${medievalDetails.classArchetype}
Cores: Primária ${primaryColor}, Acento ${accentColor}

Gere o conjunto completo de decorações medievais SVG e o prompt artístico correspondente:
`;

    const DECORATIONS_SCHEMA = {
      type: Type.OBJECT,
      properties: {
        customBorderSvg: { type: Type.STRING },
        customDividerSvg: { type: Type.STRING },
        customIconSvg: { type: Type.STRING },
        medievalPromptDescription: { type: Type.STRING },
        medievalClassArchetype: { type: Type.STRING },
        borderDescription: { type: Type.STRING },
        dividerDescription: { type: Type.STRING },
        iconDescription: { type: Type.STRING },
        cornerOrnamentType: { type: Type.STRING },
        borderStylePreset: { type: Type.STRING },
        motifDescription: { type: Type.STRING },
      },
      required: ['customBorderSvg', 'customDividerSvg', 'customIconSvg', 'medievalPromptDescription', 'medievalClassArchetype'],
    };

    const result = await generateWithKeyRotation(systemPrompt, userPrompt, {
      preferredModel,
      schema: DECORATIONS_SCHEMA,
    });

    const parsed = JSON.parse(result.text);

    return res.json({
      success: true,
      decorations: parsed,
    });
  } catch (error: any) {
    console.error('Error generating slide decorations:', error);
    const title = req.body?.slideTitle || 'Slide';
    const profile = req.body?.targetProfile || 'Achiever';
    const medieval = getMedievalArchetypeDetails(profile);
    
    return res.json({
      success: true,
      decorations: {
        customIconSvg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="38" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 2"/><polygon points="50,20 60,40 82,42 66,58 71,80 50,68 29,80 34,58 18,42 40,40" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="currentColor"/></svg>`,
        customBorderSvg: `<svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M15 45 L15 15 L45 15 M385 45 L385 15 L355 15 M15 255 L15 285 L45 285 M385 255 L385 285 L355 285" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="25" cy="25" r="4" fill="currentColor"/><circle cx="375" cy="25" r="4" fill="currentColor"/><circle cx="25" cy="275" r="4" fill="currentColor"/><circle cx="375" cy="275" r="4" fill="currentColor"/></svg>`,
        customDividerSvg: `<svg viewBox="0 0 600 40" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><line x1="20" y1="20" x2="250" y2="20" stroke="currentColor" stroke-width="1.8"/><polygon points="300,10 315,20 300,30 285,20" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/><line x1="350" y1="20" x2="580" y2="20" stroke="currentColor" stroke-width="1.8"/><circle cx="270" cy="20" r="3" fill="currentColor"/><circle cx="330" cy="20" r="3" fill="currentColor"/></svg>`,
        medievalPromptDescription: `Iluminação medieval heráldica inspirada na classe ${medieval.classArchetype}, destacando a essência de ${title}`,
        medievalClassArchetype: medieval.classArchetype,
        borderDescription: medieval.borderMotif,
        dividerDescription: medieval.dividerMotif,
        iconDescription: medieval.iconMotif,
        cornerOrnamentType: medieval.corner,
        borderStylePreset: medieval.preset,
        motifDescription: `Composição heráldica para ${title} (${profile})`,
      },
    });
  }
});

// Helper: Build atmospheric ambient prompt reflecting the profile's Environment
function buildAmbientBackgroundPrompt(params: {
  targetProfile: string;
  slideTitle?: string;
  slideTopic?: string;
  environmentSetting?: string;
  storyArcPhase?: string;
  narrativeBeat?: string;
  stylePreset?: string;
}): string {
  const profileKey = (params.targetProfile || 'mastermind').toLowerCase();
  const guide = BRAINHEX_GUIDES[profileKey] || BRAINHEX_GUIDES.mastermind;
  const environment = params.environmentSetting || guide.environment || 'Mystic celestial academy and observatory';
  const topic = params.slideTitle || params.slideTopic || 'Pedagogical Discovery';
  const arc = params.storyArcPhase ? `during ${params.storyArcPhase}` : '';

  return `Wide-angle 16:9 cinematic matte painting environment of "${environment}" ${arc}, representing the concept of "${topic}". High fantasy game concept art style, grand atmospheric environmental vista, volumetric moody lighting with tones of ${guide.color} and gold, ethereal particle mist, dramatic architectural depth and celestial horizon. Clean wide backdrop with NO people in foreground, NO human portraits, NO letters, NO typography, NO text, NO watermarks, NO user interface buttons. Pure immersive atmospheric environment.`;
}

// Fallback: Rich, high-definition SVG ambient environment backdrop in case of image API unavailability
function createFallbackAmbientSvg(profileKey: string, environment: string, topic: string): string {
  const guide = BRAINHEX_GUIDES[profileKey.toLowerCase()] || BRAINHEX_GUIDES.mastermind;
  const primaryColor = guide.color || '#7C3AED';
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="100%" height="100%">
    <defs>
      <radialGradient id="bgGlow" cx="50%" cy="30%" r="70%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.35" />
        <stop offset="60%" stop-color="#0a0a0f" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#050508" stop-opacity="0.98" />
      </radialGradient>
      <linearGradient id="horizonGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.1" />
        <stop offset="50%" stop-color="#F59E0B" stop-opacity="0.35" />
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.1" />
      </linearGradient>
      <pattern id="hexGrid" width="60" height="104" patternUnits="userSpaceOnUse">
        <path d="M30 0 L60 17 L60 52 L30 69 L0 52 L0 17 Z M30 104 L60 87 L60 52 L30 69 L0 52 L0 87 Z" fill="none" stroke="${primaryColor}" stroke-opacity="0.08" stroke-width="1.2" />
      </pattern>
    </defs>
    <rect width="1600" height="900" fill="#050508" />
    <rect width="1600" height="900" fill="url(#bgGlow)" />
    <rect width="1600" height="900" fill="url(#hexGrid)" />
    
    <!-- Horizon Light Beam & Mountain/Architecture Silhouettes -->
    <ellipse cx="800" cy="500" rx="900" ry="160" fill="url(#horizonGlow)" />
    <path d="M0 650 Q300 580 600 620 Q900 560 1200 610 Q1450 580 1600 640 L1600 900 L0 900 Z" fill="#07070c" fill-opacity="0.85" />
    <path d="M0 720 Q400 660 800 700 Q1200 650 1600 710 L1600 900 L0 900 Z" fill="#030305" fill-opacity="0.95" />
    
    <!-- Environment Ambient Glow Spheres & Stars -->
    <circle cx="200" cy="180" r="3" fill="#FFF" opacity="0.6" />
    <circle cx="450" cy="120" r="2" fill="#FFF" opacity="0.8" />
    <circle cx="780" cy="150" r="4" fill="#FDE68A" opacity="0.7" />
    <circle cx="1150" cy="90" r="2.5" fill="#FFF" opacity="0.5" />
    <circle cx="1420" cy="220" r="3" fill="#FDE68A" opacity="0.6" />
    <circle cx="800" cy="320" r="180" fill="${primaryColor}" opacity="0.12" filter="blur(40px)" />
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate Image with Gemini API and Multi-Key Rotation
async function generateImageWithKeyRotation(
  promptText: string,
  options: {
    aspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
    preferredModel?: string;
    requestKeys?: string[];
    // Presente quando a geracao deve partir de uma imagem existente do
    // material do professor (reilustrar mantendo o exemplo original como
    // base) em vez de texto->imagem puro.
    referenceImage?: { mimeType: string; data: string };
  } = {}
): Promise<{ imageUrl: string; modelUsed: string; keyIndexUsed: number }> {
  const keysPool = getApiKeysPool(options.requestKeys);
  if (keysPool.length === 0) {
    throw new Error('Nenhuma GEMINI_API_KEY configurada para geração de imagem.');
  }

  const aspectRatio = options.aspectRatio || '16:9';
  const imageModels = [
    options.preferredModel || 'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
  ];

  let lastError: any = null;
  const attempts = Math.max(keysPool.length * 2, 4);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const currentKeyIdx = (globalKeyIndex + attempt) % keysPool.length;
    const currentKey = keysPool[currentKeyIdx];
    const currentModel = imageModels[attempt % imageModels.length];

    try {
      const ai = new GoogleGenAI({
        apiKey: currentKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: {
          parts: [
            ...(options.referenceImage
              ? [{ inlineData: { mimeType: options.referenceImage.mimeType, data: options.referenceImage.data } }]
              : []),
            {
              text: promptText,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          const imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          globalKeyIndex = (currentKeyIdx + 1) % keysPool.length;
          return {
            imageUrl,
            modelUsed: currentModel,
            keyIndexUsed: currentKeyIdx,
          };
        }
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[ImageGen Attempt ${attempt + 1}] Model ${currentModel} error:`, err.message);
      // Billing/quota estruturalmente esgotados (ver isImageGenerationUnavailableError)
      // nao mudam tentando outra chave ou modelo - para o resto das tentativas
      // desta chamada em vez de repetir a mesma falha ate esgotar `attempts`.
      if (isImageGenerationUnavailableError(err)) break;
    }
  }

  if (lastError && isImageGenerationUnavailableError(lastError)) {
    throw new ImageGenerationUnavailableError(lastError.message);
  }
  throw lastError || new Error('Nenhuma imagem retornada pelos modelos.');
}

// Adaptador entre resolveSlideIllustrations (puro, testável com um
// ImageGenerator fake) e generateImageWithKeyRotation (chamada real ao
// Gemini). Falha de geração de imagem nunca derruba o slide inteiro - só
// resulta em nenhuma ilustração pra aquele slide (mesma filosofia de
// resiliência do fallback de SVG em createFallbackAmbientSvg).
async function generateSlideIllustration(params: {
  prompt: string;
  referenceImage?: { mimeType: string; data: string };
}): Promise<GeneratedImage | null> {
  try {
    const result = await generateImageWithKeyRotation(params.prompt, {
      aspectRatio: '4:3',
      referenceImage: params.referenceImage,
    });
    const match = /^data:([^;]+);base64,(.+)$/.exec(result.imageUrl);
    if (!match) return null;
    return { mimeType: match[1], dataBase64: match[2] };
  } catch (err: any) {
    console.warn('[SlideIllustrations] geração de imagem falhou:', err?.message);
    // Repropaga especificamente esse tipo - resolveSlideIllustrations usa
    // isso pra parar de tentar gerar imagem pro resto do deck (ver
    // ImageGenerationUnavailableError). Qualquer outra falha continua
    // resultando so em "sem ilustracao pra este slide" (return null).
    if (err instanceof ImageGenerationUnavailableError) throw err;
    return null;
  }
}

// API: POST /api/generate-slide-illustration (Gera ou reestiliza ilustração didática individual para um slide)
app.post('/api/generate-slide-illustration', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      slideTitle = 'Conceito Pedagógico',
      slideSubtopic = '',
      targetProfile = 'Mastermind',
      referenceImage,
    } = req.body;

    const finalPrompt =
      prompt ||
      `Infográfico conceitual, diagrama de arquitetura ou ilustração educativa clara e didática representando o conceito técnico: "${slideSubtopic || slideTitle}". ` +
      `Estilo visual: Arte conceitual técnica e nítida, atmosfera imersiva do perfil ${targetProfile}. ` +
      'Composição limpa, alto valor para orientar os estudos do aluno.';

    const result = await generateSlideIllustration({
      prompt: finalPrompt,
      referenceImage: referenceImage
        ? { mimeType: referenceImage.mimeType || 'image/png', data: referenceImage.data || referenceImage.dataBase64 }
        : undefined,
    });

    if (!result) {
      // Retorna fallback SVG para garantir visual imediato
      const pKey = String(targetProfile || 'mastermind').toLowerCase();
      const fallbackSvg = createFallbackAmbientSvg(pKey, `${slideSubtopic || slideTitle}`, slideTitle);
      return res.json({
        success: true,
        imageDataUri: fallbackSvg,
        isFallback: true,
      });
    }

    return res.json({
      success: true,
      imageDataUri: `data:${result.mimeType};base64,${result.dataBase64}`,
      mimeType: result.mimeType,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API Microservice: POST /api/generate-ambient-background
// Generates an atmospheric 16:9 ambient background image tailored to the BrainHex Profile's Environment
app.post('/api/generate-ambient-background', async (req: Request, res: Response) => {
  try {
    const {
      slideId,
      slideTitle = 'Tópico de Aprendizagem',
      slideTopic = '',
      targetProfile = 'mastermind',
      environmentSetting,
      storyArcPhase,
      narrativeBeat,
      stylePreset,
      aspectRatio = '16:9',
      customPrompt,
      preferredModel = 'gemini-3.1-flash-lite-image',
      requestKeys,
    } = req.body;

    const profileKey = String(targetProfile || 'mastermind').toLowerCase();
    const guide = BRAINHEX_GUIDES[profileKey] || BRAINHEX_GUIDES.mastermind;
    const effectiveEnvironment = environmentSetting || guide.environment || 'Observatório Cósmico & Tomos Celestiais';

    const promptToUse = customPrompt && customPrompt.trim()
      ? customPrompt.trim()
      : buildAmbientBackgroundPrompt({
          targetProfile: profileKey,
          slideTitle,
          slideTopic,
          environmentSetting: effectiveEnvironment,
          storyArcPhase,
          narrativeBeat,
          stylePreset,
        });

    let imageUrl: string;
    let modelUsed: string = preferredModel;
    let isFallback = false;

    try {
      const result = await generateImageWithKeyRotation(promptToUse, {
        aspectRatio: (aspectRatio as any) || '16:9',
        preferredModel,
        requestKeys,
      });
      imageUrl = result.imageUrl;
      modelUsed = result.modelUsed;
    } catch (imgError: any) {
      console.warn('[AmbientBg] Image model unavailable or rate limited, generating high-definition ambient SVG fallback:', imgError.message);
      imageUrl = createFallbackAmbientSvg(profileKey, effectiveEnvironment, slideTitle);
      isFallback = true;
      modelUsed = 'ambient-vector-engine';
    }

    return res.json({
      success: true,
      slideId,
      imageUrl,
      prompt: promptToUse,
      environmentSetting: effectiveEnvironment,
      targetProfile: profileKey,
      modelUsed,
      isFallback,
    });
  } catch (error: any) {
    console.error('Error generating ambient background:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao gerar imagem de fundo ambiente.',
    });
  }
});

// API Microservice: POST /api/v1/generate-background (Alias for microservice clients)
app.post('/api/v1/generate-background', async (req: Request, res: Response) => {
  try {
    const {
      slideTitle = 'Tópico de Aprendizagem',
      targetProfile = 'mastermind',
      environmentSetting,
      aspectRatio = '16:9',
    } = req.body;

    const profileKey = String(targetProfile || 'mastermind').toLowerCase();
    const guide = BRAINHEX_GUIDES[profileKey] || BRAINHEX_GUIDES.mastermind;
    const effectiveEnvironment = environmentSetting || guide.environment;

    const prompt = buildAmbientBackgroundPrompt({
      targetProfile: profileKey,
      slideTitle,
      environmentSetting: effectiveEnvironment,
    });

    try {
      const result = await generateImageWithKeyRotation(prompt, {
        aspectRatio: (aspectRatio as any) || '16:9',
      });
      return res.json({
        success: true,
        imageUrl: result.imageUrl,
        prompt,
        environmentSetting: effectiveEnvironment,
        targetProfile: profileKey,
        modelUsed: result.modelUsed,
      });
    } catch (e: any) {
      const fallback = createFallbackAmbientSvg(profileKey, effectiveEnvironment, slideTitle);
      return res.json({
        success: true,
        imageUrl: fallback,
        prompt,
        environmentSetting: effectiveEnvironment,
        targetProfile: profileKey,
        modelUsed: 'ambient-vector-engine',
        isFallback: true,
      });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API: Save to Supabase bucket 'conteudo_aluno' organized by perfil/topicos/classe
app.post('/api/supabase/save-conteudo-aluno', async (req: Request, res: Response) => {
  try {
    const {
      url,
      anonKey,
      bucketName = 'conteudo_aluno',
      perfil,
      topico,
      classe = 'turma_geral',
      deckJson,
      markdownText,
      audioScriptText,
      pdfBase64,
    } = req.body;

    const finalUrl = url || process.env.SUPABASE_URL;
    const finalKey = anonKey || process.env.SUPABASE_ANON_KEY;

    if (!finalUrl || !finalKey) {
      return res.status(400).json({
        success: false,
        error: 'Configure a URL e Anon Key do Supabase.',
      });
    }

    const supabase = createClient(finalUrl, finalKey);
    const cleanPerfil = String(perfil || 'geral').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanTopico = String(topico || 'assunto').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanClasse = String(classe || 'turma').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();

    // Folder structure: conteudo_aluno/{perfil}/{topicos}/{classe}/
    const folderPath = `${cleanPerfil}/${cleanTopico}/${cleanClasse}`;
    const uploadedFiles: Array<{ name: string; path: string; publicUrl?: string }> = [];

    // 1. Upload Deck JSON
    if (deckJson) {
      const jsonContent = typeof deckJson === 'string' ? deckJson : JSON.stringify(deckJson, null, 2);
      const filePath = `${folderPath}/deck_${timestamp}.json`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(jsonContent, 'utf-8'), {
        contentType: 'application/json',
        upsert: true,
      });
      if (!error) {
        const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploadedFiles.push({ name: 'deck.json', path: filePath, publicUrl: pubUrl?.publicUrl });
      }
    }

    // 2. Upload Markdown
    if (markdownText) {
      const filePath = `${folderPath}/aula_${timestamp}.md`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(markdownText, 'utf-8'), {
        contentType: 'text/markdown',
        upsert: true,
      });
      if (!error) {
        const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploadedFiles.push({ name: 'aula.md', path: filePath, publicUrl: pubUrl?.publicUrl });
      }
    }

    // 3. Upload Audio Script / Narration
    if (audioScriptText) {
      const filePath = `${folderPath}/audio_narracao_${timestamp}.txt`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(audioScriptText, 'utf-8'), {
        contentType: 'text/plain',
        upsert: true,
      });
      if (!error) {
        const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploadedFiles.push({ name: 'audio_narracao.txt', path: filePath, publicUrl: pubUrl?.publicUrl });
      }
    }

    // 4. Upload PDF if provided
    if (pdfBase64) {
      const rawPdf = pdfBase64.startsWith('data:') ? pdfBase64.split(',')[1] : pdfBase64;
      const filePath = `${folderPath}/apresentacao_${timestamp}.pdf`;
      const { error } = await supabase.storage.from(bucketName).upload(filePath, Buffer.from(rawPdf, 'base64'), {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (!error) {
        const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(filePath);
        uploadedFiles.push({ name: 'apresentacao.pdf', path: filePath, publicUrl: pubUrl?.publicUrl });
      }
    }

    return res.json({
      success: true,
      message: `Conteúdos salvos com sucesso na estrutura ${bucketName}/${folderPath}/`,
      folderPath,
      files: uploadedFiles,
    });
  } catch (error: any) {
    console.error('Error saving conteudo_aluno to Supabase:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao salvar no bucket conteudo_aluno do Supabase.',
    });
  }
});

// API: Supabase Test Connection
app.post('/api/supabase/test', async (req: Request, res: Response) => {
  try {
    const { url, anonKey, bucketName } = req.body;
    const finalUrl = url || process.env.SUPABASE_URL;
    const finalKey = anonKey || process.env.SUPABASE_ANON_KEY;
    const finalBucket = bucketName || process.env.SUPABASE_BUCKET_NAME || 'trailup-slides';

    if (!finalUrl || !finalKey) {
      return res.status(400).json({
        success: false,
        error: 'Supabase URL e Anon Key são obrigatórios.',
      });
    }

    const supabase = createClient(finalUrl, finalKey);

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

    if (bucketError) {
      return res.status(400).json({
        success: false,
        error: `Erro ao listar buckets: ${bucketError.message}`,
      });
    }

    const bucketFound = buckets?.some((b) => b.name === finalBucket);

    return res.json({
      success: true,
      buckets: buckets?.map((b) => b.name) || [],
      bucketFound,
      message: bucketFound
        ? `Conexão bem-sucedida! Bucket "${finalBucket}" pronto para uso.`
        : `Conectado ao Supabase com sucesso. Atenção: certifique-se de que o bucket "${finalBucket}" está criado nas configurações do Supabase.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao testar conexão com Supabase.',
    });
  }
});

// API: Supabase Upload
app.post('/api/supabase/upload', async (req: Request, res: Response) => {
  try {
    const {
      url,
      anonKey,
      bucketName,
      fileName,
      fileContent, // base64 or string
      contentType = 'text/html',
    } = req.body;

    const finalUrl = url || process.env.SUPABASE_URL;
    const finalKey = anonKey || process.env.SUPABASE_ANON_KEY;
    const finalBucket = bucketName || process.env.SUPABASE_BUCKET_NAME || 'trailup-slides';

    if (!finalUrl || !finalKey) {
      return res.status(400).json({
        success: false,
        error: 'Configure a URL e Anon Key do Supabase.',
      });
    }

    if (!fileName || !fileContent) {
      return res.status(400).json({
        success: false,
        error: 'Nome do arquivo e conteúdo são obrigatórios.',
      });
    }

    const supabase = createClient(finalUrl, finalKey);

    let buffer: Buffer;
    if (typeof fileContent === 'string' && fileContent.startsWith('data:')) {
      const base64Data = fileContent.split(',')[1];
      buffer = Buffer.from(base64Data, 'base64');
    } else if (typeof fileContent === 'string') {
      buffer = Buffer.from(fileContent, 'utf-8');
    } else {
      buffer = Buffer.from(fileContent);
    }

    const cleanPath = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { data, error } = await supabase.storage
      .from(finalBucket)
      .upload(cleanPath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from(finalBucket)
      .getPublicUrl(cleanPath);

    return res.json({
      success: true,
      path: cleanPath,
      publicUrl: publicUrlData.publicUrl,
      message: 'Arquivo salvo com sucesso no bucket do Supabase!',
    });
  } catch (error: any) {
    console.error('Supabase upload error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao realizar upload no Supabase.',
    });
  }
});

// API: Supabase List Files
app.post('/api/supabase/list', async (req: Request, res: Response) => {
  try {
    const { url, anonKey, bucketName } = req.body;
    const finalUrl = url || process.env.SUPABASE_URL;
    const finalKey = anonKey || process.env.SUPABASE_ANON_KEY;
    const finalBucket = bucketName || process.env.SUPABASE_BUCKET_NAME || 'trailup-slides';

    if (!finalUrl || !finalKey) {
      return res.status(400).json({
        success: false,
        error: 'Configure a URL e Anon Key do Supabase.',
      });
    }

    const supabase = createClient(finalUrl, finalKey);
    const { data, error } = await supabase.storage.from(finalBucket).list('', {
      limit: 50,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    const filesWithUrls = (data || []).map((file) => {
      const { data: publicUrlData } = supabase.storage
        .from(finalBucket)
        .getPublicUrl(file.name);
      return {
        ...file,
        publicUrl: publicUrlData.publicUrl,
      };
    });

    return res.json({ success: true, files: filesWithUrls });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar arquivos do Supabase.',
    });
  }
});

// Setup Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TrailUp BrainHex Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
