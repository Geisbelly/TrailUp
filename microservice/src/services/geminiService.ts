import { GoogleGenAI, Type, Modality } from "@google/genai";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as lamejs from "lamejs";
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
    
    2. Exemplos Visuais da Origem (MUITO CRÍTICO):
       - Se você encontrar imagens, diagramas ou fluxogramas nas partes multimodais enviadas (IMAGENS DE REFERÊNCIA), você DEVE descrevê-los detalhadamente no campo 'visualDescription'.
       - Use essas referências visuais para criar o 'imagePrompt', pedindo uma versão "Alquímica/2D Mágica" baseada exatamente naquela imagem do anexo.
       - Se o anexo contiver uma foto de uma pessoa ou cenário, transforme-a em uma ilustração épica coerente com o tema ${profile}.
    
    3. Exemplos e Analogias (Didática Alquímica):
       - Slides e Texto: Você DEVE incluir exemplos escritos explícitos e analogias temáticas para facilitar a compreensão.
       - Marque seções de exemplo com títulos como "CASO DE ESTUDO" ou "NA PRÁTICA".
    
    4. Grimório (Markdown) & Narrativa Visual:
       MERGULHO TEMÁTICO: O conteúdo deve respirar o arquétipo ${profile}.
       - 'mastermind': Lexicografia técnica.
       - 'seeker': Linguagem evocativa.
       - 'survivor': Dialeto pragmático.
       - 'daredevil': Verbos de ação.
       - 'conqueror': Tom majestoso.
       - 'socializer': Narrativa empática.
       - 'achiever': Foco em progressão.

    3. Eco da Sabedoria (Script de Áudio):
       O roteiro deve ser ESCRITO para ser falado pelo guia ${config.guideName}. 
       - Se ${profile} for 'seeker', o narrador deve parecer ofegante e animado.
       - Se 'mastermind', calmo, calculista e pausado.
       - Se 'survivor', firme, grave e protetor.
       - Inclua marcações de [Tom: ...] para guiar a entonação mística.

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
                sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "topics", "explanation", "visualDescription", "characterQuote", "characterAction", "imagePrompt", "sourceIds"]
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

/**
 * Natural Audio Generation using Gemini 3.1 TTS
 */
export async function generateNaturalAudio(
  text: string,
  voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = 'Kore',
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

    // Solução robusta para erro "MPEGMode is not defined" em ambientes ESM/Vite
    const Lib = (lamejs as any).default || lamejs;
    if (typeof (globalThis as any).MPEGMode === "undefined") {
        (globalThis as any).MPEGMode = Lib.MPEGMode;
    }
    if (typeof (globalThis as any).Lame === "undefined") {
        (globalThis as any).Lame = Lib.Lame;
    }
    if (typeof (globalThis as any).BitStream === "undefined") {
        (globalThis as any).BitStream = Lib.BitStream;
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
