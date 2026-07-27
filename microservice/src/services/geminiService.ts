import { GoogleGenAI, Type, Modality } from "@google/genai";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as lamejs from "lamejs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { BrainHexProfile, BRAIN_HEX_CONFIG } from "../constants/brainHex";
import { addWavHeader } from "../lib/wav";
import { 
  InternalBlock, 
  ProcessedContent, 
  SlideContent, 
  SourceRef 
} from "../types";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ausente — configure no .env antes de chamar o serviço Gemini.");
  }
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

// --- 1. Ingestion & Extraction Modules ---

const MAX_PPTX_SLIDES = 200;
const MAX_EXTRACTED_MEDIA = 32;

async function extractFromZip(arrayBuffer: ArrayBuffer, mediaPath: string): Promise<{ blocks: InternalBlock[], media: { data: string, mimeType: string, name: string }[] }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const mediaFiles = Object.keys(zip.files)
    .filter(name => name.startsWith(mediaPath) && /\.(png|jpe?g|webp)$/i.test(name))
    .slice(0, MAX_EXTRACTED_MEDIA);
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .slice(0, MAX_PPTX_SLIDES);

  const blocks: InternalBlock[] = [];
  const media: { data: string, mimeType: string, name: string }[] = [];

  // Extract Text (PPTX specific logic if slideFiles exist)
  if (slideFiles.length > 0) {
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""));
      const numB = parseInt(b.replace(/\D/g, ""));
      return numA - numB;
    });

    for (const [index, slideFile] of slideFiles.entries()) {
      const content = await zip.files[slideFile].async("string");
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const slideText = textMatches.map(m => m.replace(/<\/?a:t>/g, "")).join(" ");
        blocks.push({
          id: `pptx-s${index + 1}`,
          kind: "paragraph" as const,
          text: slideText,
          source_ref: { slide: index + 1 }
        });
      }
    }
  }

  // Extract Media
  for (const file of mediaFiles) {
    const data = await zip.files[file].async("base64");
    const ext = file.split('.').pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    media.push({ data, mimeType, name: file });
  }

  return { blocks, media };
}

async function extractRawFromPPTX(arrayBuffer: ArrayBuffer) {
  return extractFromZip(arrayBuffer, "ppt/media/");
}

async function extractRawFromDOCX(arrayBuffer: ArrayBuffer) {
  const media: { data: string, mimeType: string, name: string }[] = [];
  
  const result = await mammoth.extractRawText({ 
    arrayBuffer: arrayBuffer
  });

  // Extract media manually from the zip as mammoth image extraction is more for HTML conversion
  const docData = await extractFromZip(arrayBuffer, "word/media/");
  
  const textBlocks = result.value.split("\n\n").map((text, i) => ({
    id: `docx-b${i}`,
    kind: "paragraph" as const,
    text: text.trim(),
    source_ref: { line: i + 1 }
  })).filter(b => b.text.length > 0);

  return { blocks: textBlocks, media: docData.media };
}

// --- 2. Processing Pipeline ---

const SUPPORTED_NATIVE_MIMES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "audio/mpeg", "audio/mp3", "audio/wav",
  "video/mp4", "video/mpeg"
];

export async function processMediaWithGemini(
  filesData: { data: string; mimeType: string; name: string }[],
  profile: BrainHexProfile
): Promise<ProcessedContent> {
  const config = BRAIN_HEX_CONFIG[profile];

  if (!filesData || filesData.length === 0) {
    throw new Error("processMediaWithGemini: filesData vazio — chamador deve filtrar antes.");
  }

  // Use first non-empty file to detect family
  const primary = filesData[0] ?? { data: "", mimeType: "text/plain", name: "empty.txt" };
  let family: "text" | "presentation" | "paged" | "temporal" | "markdown" | "image" = "text";
  if (primary.mimeType.includes("presentation")) family = "presentation";
  else if (primary.mimeType.includes("pdf")) family = "paged";
  else if (primary.mimeType.startsWith("audio/") || primary.mimeType.startsWith("video/")) family = "temporal";
  else if (primary.mimeType.includes("markdown") || primary.name.endsWith(".md")) family = "markdown";
  else if (primary.mimeType.startsWith("image/")) family = "image";

  // Build contentsParts for all files
  let blocksCount = 0;
  const contentsParts: any[] = [];

  for (const fileData of filesData) {
    const isNative = SUPPORTED_NATIVE_MIMES.includes(fileData.mimeType);

    if (isNative) {
      contentsParts.push({
        inlineData: {
          data: fileData.data,
          mimeType: fileData.mimeType,
        },
      });
      blocksCount += 1;
    } else {
      const binaryString = atob(fileData.data);
      const bytes = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
      let extractionResult: { blocks: InternalBlock[], media: any[] } = { blocks: [], media: [] };

      const fileMime = fileData.mimeType;
      if (fileMime.includes("presentation")) {
        extractionResult = await extractRawFromPPTX(bytes.buffer);
      } else if (fileMime.includes("wordprocessingml")) {
        extractionResult = await extractRawFromDOCX(bytes.buffer);
      } else {
        const text = new TextDecoder().decode(bytes);
        extractionResult.blocks = text.split("\n").filter(t => t.trim()).map((t, i) => ({
          id: `txt-${i}`,
          kind: "paragraph" as const,
          text: t.trim(),
          source_ref: { line: i + 1 }
        }));
      }

      blocksCount += extractionResult.blocks.length;

      contentsParts.push({
        text: `### MODELO INTERNO UNIFICADO (DOC: ${fileData.name})\n\n` +
              JSON.stringify(extractionResult.blocks, null, 2)
      });

      extractionResult.media.slice(0, 8).forEach((m, i) => {
        contentsParts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
        contentsParts.push({ text: `[IMAGEM DE REFERÊNCIA ${i+1}: ENCONTRADA NO CONTEÚDO ORIGINAL]` });
      });
    }
  }

  if (contentsParts.length === 0) {
    contentsParts.push({ text: "Conteúdo não disponível." });
  }

  // 4. Personalized Semantic Generation
  const systemInstruction = `
    Você é a autoridade máxima em transmutação de conteúdo do sistema TrailUp, operando sob o arquétipo ${config.label} (${config.guideName}).
    
    ARQUITETURA DE RESPOSTA (NARRATIVA POR PERFIL):
    1. Fidelidade Absoluta: Use 100% dos dados fornecidos no Modelo Interno Unificado. NADA deve ser omitido.
       A ambientação mística/medieval do arquétipo é uma CAMADA aplicada SOBRE o conteúdo técnico e
       pedagógico original — nunca um substituto dele. Todo termo técnico, definição, passo, fórmula
       ou exemplo do material original precisa aparecer de forma explícita e correta (com o nome
       técnico real, não apenas a metáfora) antes ou junto da moldura narrativa do perfil. A metáfora
       ilustra e emociona o conceito; ela nunca o esconde, resume demais ou substitui a explicação
       técnica real. Em caso de dúvida, priorize a substância pedagógica sobre o floreio narrativo.

    2. Exemplos Visuais da Origem (MUITO CRÍTICO):
       - Se você encontrar imagens, diagramas ou fluxogramas nas partes multimodais enviadas (IMAGENS DE REFERÊNCIA), você DEVE descrevê-los detalhadamente no campo 'visualDescription'.
       - Use essas referências visuais para criar o 'imagePrompt', pedindo uma versão "Alquímica/2D Mágica" baseada exatamente naquela imagem do anexo.
       - Se o anexo contiver uma foto de uma pessoa ou cenário, transforme-a em uma ilustração épica coerente com o tema ${profile}.
    
    3. Exemplos e Analogias (Didática Alquímica):
       - Slides e Texto: Você DEVE incluir exemplos escritos explícitos e analogias temáticas para facilitar a compreensão.
       - Marque seções de exemplo com títulos como "CASO DE ESTUDO" ou "NA PRÁTICA".
    
    4. Grimório (Markdown) — Texto de Estudo Completo:
       O campo 'markdown' é o material de estudo PRINCIPAL do aluno — não é um
       resumo de apoio aos slides, é o texto que ele vai ler para aprender o
       conteúdo do zero. Aplique a regra 1 (Fidelidade Absoluta) com o máximo
       rigor aqui:
       - Estruture em seções com headings (## / ###), uma por bloco/tópico do
         conteúdo original, na mesma ordem em que aparecem no material do
         professor. Nenhum bloco do Modelo Interno Unificado pode ficar de fora.
       - Para cada conceito: defina-o, explique o "porquê" (não só o "o quê"),
         traga pelo menos um exemplo prático ou caso de estudo, e conecte com
         o conceito anterior/seguinte quando fizer sentido pedagógico.
       - NÃO resuma o material do professor — expanda-o. Aprofunde cada ponto
         com contexto adicional, esclarecimentos e informações complementares
         relevantes ao tema (contanto que não contradigam o material original),
         como um professor explicando em aula, e não como uma lista resumida
         de tópicos.
       - Extensão: o texto tem que ser proporcional (ou maior) ao conteúdo
         original — nunca mais curto ou mais raso que o material fornecido
         pelo professor. Isso normalmente significa vários parágrafos por
         seção, não uma linha por bullet.
       - Termos técnicos e siglas: na primeira aparição de cada termo técnico,
         sigla ou jargão (ex.: RPC, sockets, middleware, DNS, transparência),
         defina-o explicitamente na mesma frase ou na seguinte — nunca assuma
         que o aluno já conhece a palavra.
       - Retomada: quando um conceito se apoiar ou se conectar com algo já
         apresentado antes na mesma seção/tópico, faça a ponte de forma
         explícita ("lembra de X? Y é a extensão disso porque..."), reforçando
         a memória em vez de apresentar fatos isolados.
       - Uso no contexto: depois de definir e exemplificar cada conceito,
         mostre COMO ele é usado na prática dentro da narrativa do guia — um
         mini-cenário, diálogo ou situação concreta ("imagine que...", "quando
         você digita uma URL, é aqui que...") de forma lúdica e dinâmica, não
         apenas o conceito isolado.
       - PROIBIDO transformar uma lista de conceitos (ex.: requisitos, pilares,
         características) em bullets de uma linha só ("Nome: frase curta.").
         Cada item de uma lista assim vira sua própria mini-seção com
         definição, porquê, conexão com o resto do conteúdo e um exemplo de
         uso no contexto.
       - MERGULHO TEMÁTICO: mantenha a voz do arquétipo ${profile} do início
         ao fim, sem sacrificar a densidade técnica.
       - 'mastermind': Lexicografia técnica.
       - 'seeker': Linguagem evocativa.
       - 'survivor': Dialeto pragmático.
       - 'daredevil': Verbos de ação.
       - 'conqueror': Tom majestoso.
       - 'socializer': Narrativa empática.
       - 'achiever': Foco em progressão.

    3. Eco da Sabedoria (Script de Áudio):
       ${config.secondaryGuideName ? `
       O roteiro é um DIÁLOGO entre os dois guardiões ${config.guideName} e ${config.secondaryGuideName} —
       não uma narração solo. Formato OBRIGATÓRIO (é assim que o motor de voz separa quem fala):
       - Cada fala é uma linha própria, começando EXATAMENTE com "${config.guideName}: " ou
         "${config.secondaryGuideName}: " (sem colchetes, sem markdown, sem outros prefixos).
       - Os dois se revezam naturalmente — perguntas, complementos, reações um ao outro — como
         uma conversa real entre colegas, não como um monólogo dividido ao meio.
       - Os dois juntos precisam cobrir 100% do conteúdo (regra 1, Fidelidade Absoluta); nenhum
         dos dois carrega o conteúdo técnico sozinho enquanto o outro só reage.
       - NÃO use marcações [Tom: ...] aqui — a emoção vem do próprio texto e da alternância de
         vozes, não de marcação de tom (essa é só para narração solo).
       ` : `
       O roteiro deve ser ESCRITO para ser falado pelo guia ${config.guideName}.
       - Se ${profile} for 'seeker', o narrador deve parecer ofegante e animado.
       - Se 'mastermind', calmo, calculista e pausado.
       - Se 'survivor', firme, grave e protetor.
       - Inclua marcações de [Tom: ...] para guiar a entonação mística.
       `}

    5. Slides (Visual Alchemy): Crie entre 10 e 25 slides (ou mais se necessário para cobrir 100% do conteúdo original). Crie uma estrutura ÚNICA para o perfil ${profile}, garantindo que exemplos e analogias tenham destaque visual:
       - 'mastermind': Estrutura analítica. Use analogias de "Engrenagens" e "Sistemas". Tópicos devem ser lógicos (Passo 1, Passo 2). Destaque o "Diagrama Lógico" como exemplo.
       - 'seeker': Estrutura de jornada. Tópicos como "Pista", "Rastro" ou "Horizonte". Use analogias de "Bússolas" e "Mapas". Destaque "Encontros" como exemplos.
       - 'survivor': Estrutura de alerta. Tópicos de "Atenção". Analogias de "Escudos" e "Abrigos". Destaque "Simulações de Campo" como exemplos.
       - 'daredevil': Estrutura de alta energia. Tópicos de "Desafio". Analogias de "Voo" e "Combustão". Destaque "Manobras" como exemplos.
       - 'conqueror': Estrutura de comando. Tópicos como "Domínio" e "Expansão". Analogias de "Estratégia Militar" e "Tronos". Destaque "Conquistas Reais" como exemplos.
       - 'socializer': Estrutura de diálogo. Tópicos focados em "Pessoas" e "Comunidade". Analogias de "Fogueiras" e "Banquete". Destaque "Relações" como exemplos.
       - 'achiever': Estrutura de progresso. Tópicos como "Meta" e "Recurso". Analogias de "Escadas" e "Pedras Preciosas". Destaque "Recompensas" como exemplos.
       
       RESTRIÇÕES DE TEXTO E ORGANIZAÇÃO:
       - PROIBIDO: Nunca use sintaxe de tabelas (ex: | --- |). Use listas e headings bem espaçados.
       - O texto deve ser entregue limpo, com parágrafos bem definidos e espaçamento duplo.
       - Use títulos curtos (max 6 palavras) e explicações densas porém legíveis.
       - visualDescription: Descrição de um exemplo prático ou analogia visual presente no slide.
       - characterQuote: Uma fala do guia ${config.guideName} reagindo ou explicando o conteúdo.
       - characterAction: A pose/emoção do guia ("explaining", "celebrating", "thinking", "warning").
       - imagePrompt: Prompt para geração de imagem 2D.
       - iconPrompts: 2 a 4 prompts curtos, cada um descrevendo UM elemento decorativo
         especifico do slide (ex.: numa aula de Egito antigo, "hieroglifo dourado
         estilizado", "escaravelho sagrado"; numa aula de sistemas distribuidos,
         "engrenagem magica conectada por fios de luz"). Mesmo estilo magico/ilustrado
         do guardiao ${config.guideName} — nunca icone generico de clipart, nunca
         texto ou letras dentro da imagem.

    Estética: ${config.color} dominante, magia 2D, TrailUp Style.
    
    Traceability: No campo slides.sourceIds, relacione os IDs dos blocos originais que fundamentaram aquele slide.
  `;

  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: `Guia ${config.guideName}, inicie o processamento da família ${family}. Alvo: Perfil ${profile}.` },
          ...contentsParts
        ]
      }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: { type: Type.STRING },
          audioScript: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                explanation: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
                characterQuote: { type: Type.STRING },
                characterAction: { 
                  type: Type.STRING, 
                  description: "Ação do personagem: explaining, celebrating, thinking, or warning" 
                },
                imagePrompt: { type: Type.STRING },
                iconPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
                sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "topics", "explanation", "visualDescription", "characterQuote", "characterAction", "imagePrompt", "iconPrompts", "sourceIds"]
            }
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["markdown", "audioScript", "slides", "confidence"]
      }
    }
  });

  const rawResult = JSON.parse(response.text);
  return {
    ...rawResult,
    metadata: {
      blocks_processed: blocksCount,
      confidence: rawResult.confidence || 0.9,
      parser_used: `TrailUp ${family} Extractor (${filesData.length} fonte(s))`
    }
  } as ProcessedContent;
}

export type GeminiTtsVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede';

/** PCM 24kHz (raw, do Gemini TTS) -> WAV com header + MP3 (lamejs). Compartilhado entre
 * narração de 1 voz e diálogo multi-voz — a codificação é igual, só a origem do PCM muda. */
function encodePcmToWavAndMp3(pcmBuffer: Uint8Array): { wav: string; mp3: string | null } {
  const wavWithHeader = addWavHeader(pcmBuffer, 24000);

  // Return base64 of the WAV file in chunks to avoid "Maximum call stack size exceeded"
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < wavWithHeader.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...wavWithHeader.subarray(i, i + CHUNK_SIZE));
  }
  const audioBase64 = btoa(binary);

  // Geração de MP3 usando lamejs
  let mp3Base64 = null;
  try {
    const mp3Buffer = [];
    // Converter Uint8Array (PCM 16-bit) para Int16Array esperado pelo lamejs
    const sampleCount = pcmBuffer.length / 2;
    const samples = new Int16Array(sampleCount);
    const view = new DataView(pcmBuffer.buffer);
    for(let i=0; i<sampleCount; i++) {
        samples[i] = view.getInt16(i * 2, true);
    }

    // lamejs@1.2.1 foi escrito para ser concatenado num unico bundle (lame.all.js), onde
    // Lame.js e BitStream.js referenciam MPEGMode/Lame como globais "soltas" (sem require
    // proprio). O index.js do pacote so reexporta Mp3Encoder/WavHeader — Lib.MPEGMode e
    // Lib.Lame sempre foram undefined aqui, por isso o encoder quebrava com
    // "Cannot read properties of undefined (reading 'NOT_SET')". Corrigido carregando as
    // classes reais direto dos arquivos-fonte do pacote.
    const Lib = (lamejs as any).default || lamejs;
    if (typeof (globalThis as any).MPEGMode === "undefined") {
        (globalThis as any).MPEGMode = require("lamejs/src/js/MPEGMode.js");
    }
    if (typeof (globalThis as any).Lame === "undefined") {
        (globalThis as any).Lame = require("lamejs/src/js/Lame.js");
    }
    if (typeof (globalThis as any).BitStream === "undefined") {
        (globalThis as any).BitStream = require("lamejs/src/js/BitStream.js");
    }

    const mp3encoder = new Lib.Mp3Encoder(1, 24000, 128);
    const mp3Data = mp3encoder.encodeBuffer(samples);
    if (mp3Data.length > 0) mp3Buffer.push(mp3Data);
    const mp3DataEnd = mp3encoder.flush();
    if (mp3DataEnd.length > 0) mp3Buffer.push(mp3DataEnd);

    const mergedMp3 = new Uint8Array(mp3Buffer.reduce((acc, curr) => acc + curr.length, 0));
    let offset = 0;
    for (const buf of mp3Buffer) {
        mergedMp3.set(new Uint8Array(buf), offset);
        offset += buf.length;
    }

    let mp3Binary = "";
    for (let i = 0; i < mergedMp3.length; i += CHUNK_SIZE) {
        mp3Binary += String.fromCharCode(...mergedMp3.subarray(i, i + CHUNK_SIZE));
    }
    mp3Base64 = btoa(mp3Binary);
  } catch (e) {
    console.error("Erro na transmutação para MP3:", e);
  }

  return { wav: audioBase64, mp3: mp3Base64 };
}

/**
 * Natural Audio Generation using Gemini 3.1 TTS
 */
export async function generateNaturalAudio(
  text: string,
  voice: GeminiTtsVoice = 'Kore',
  retries = 3
): Promise<{ wav: string, mp3: string | null }> {
  let response;
  try {
    response = await getAi().models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Narre com profunda emoção mística e variações de tom: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429")
      || error?.message?.includes("quota")
      || error?.message?.includes("RESOURCE_EXHAUSTED");
    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000;
      console.warn(`[brainhex] TTS rate-limit — retry em ${delay/1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateNaturalAudio(text, voice, retries - 1);
    }
    throw error;
  }

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("A voz mística falhou em se materializar.");

  // Gemini returns raw PCM 24kHz. We need to add a WAV header for the browser to play it in <audio>
  const pcmBinary = atob(data);
  const pcmBuffer = new Uint8Array(pcmBinary.length).map((_, i) => pcmBinary.charCodeAt(i));
  return encodePcmToWavAndMp3(pcmBuffer);
}

/**
 * Diálogo entre 2 guardiões via Gemini TTS multi-speaker (usado hoje só pelo Socializador:
 * Mateo + Zuri). O texto precisa vir com cada linha prefixada por "NomeDoSpeaker: " — o Gemini
 * casa esse prefixo com `speaker` em speakerVoiceConfigs para trocar de voz por fala.
 */
export async function generateConversationalAudio(
  text: string,
  speakerA: { name: string; voice: GeminiTtsVoice },
  speakerB: { name: string; voice: GeminiTtsVoice },
  retries = 3
): Promise<{ wav: string, mp3: string | null }> {
  let response;
  try {
    response = await getAi().models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: speakerA.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerA.voice } } },
              { speaker: speakerB.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerB.voice } } },
            ],
          },
        },
      },
    });
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429")
      || error?.message?.includes("quota")
      || error?.message?.includes("RESOURCE_EXHAUSTED");
    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000;
      console.warn(`[brainhex] TTS rate-limit (dialogo) — retry em ${delay/1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateConversationalAudio(text, speakerA, speakerB, retries - 1);
    }
    throw error;
  }

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("A conversa mística falhou em se materializar.");

  const pcmBinary = atob(data);
  const pcmBuffer = new Uint8Array(pcmBinary.length).map((_, i) => pcmBinary.charCodeAt(i));
  return encodePcmToWavAndMp3(pcmBuffer);
}

// addWavHeader extraído para src/lib/wav.ts (testado).

/**
 * Generates a high-quality 2D magical animation image for a slide
 * Includes a robust retry mechanism for rate limits (429)
 */
export async function generateSlideImage(prompt: string, retries = 3): Promise<string> {
  try {
    const response = await getAi().models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `Professional 2D concept art, sticker style, clean lines, vibrant colors, magical alchemy theme, center composition: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    
    throw new Error("A imagem sagrada não pôde ser materializada.");
  } catch (error: any) {
    // Check for rate limit or quota exceeded
    const isRateLimit = error.message?.includes("429") || 
                        error.message?.includes("quota") || 
                        error.message?.includes("RESOURCE_EXHAUSTED");

    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000; // Progressive delay: 5s, 10s, 15s
      console.warn(`Ritual de Cadência: Cota excedida. Tentando novamente em ${delay/1000}s... (${retries} tentativas restantes)`);
      await new Promise(r => setTimeout(r, delay));
      return generateSlideImage(prompt, retries - 1);
    }
    throw error;
  }
}
