import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Wand2,
  Layers,
  Key,
  Clock,
  Cloud,
  CheckCircle2,
  RotateCw,
  Copy,
  Download,
  Sliders,
  UploadCloud,
  FileText,
  FileCode,
  FileAudio,
  FileVideo,
  FileSpreadsheet,
  File as FileIcon,
  Trash2,
  AlignLeft,
  PackageCheck,
  Check,
  BookOpen,
  ShieldAlert,
  Crosshair,
  ScrollText,
  Cpu,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckSquare,
  Target,
  FolderOpen,
} from 'lucide-react';
import {
  BrainHexType,
  DeckData,
  SlideData,
  ProfileBatchItemState,
  GenerationSettings,
  UploadedSourceAttachment,
} from '../types';
import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';
import {
  PERSONA_BLUEPRINT_CONFIGS,
  getPersonaBlueprint,
  PersonaBlueprintConfig,
  PersonaBlueprintPreset,
} from '../data/personaBlueprintConfigs';
import { BrainHexAvatar } from './BrainHexAvatars';
import { playSoundEffect } from '../utils/audioSynth';
import { generateInteractiveHtml } from '../utils/deckExportUtils';
import { generateClientFallbackDeck } from '../utils/fallbackDeckGenerator';

interface GeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckGenerated: (deck: DeckData) => void;
}

const ALL_BRAINHEX_PROFILES: BrainHexType[] = [
  'Achiever',
  'Seeker',
  'Mastermind',
  'Conqueror',
  'Socializer',
  'Daredevil',
  'Survivor',
];

const TOPIC_SUGGESTIONS = [
  'Arquitetura de Microsserviços & Teorema CAP',
  'Clean Code, SOLID & Padrões de Projeto',
  'Inteligência Artificial & Engenharia de Prompts',
  'Estruturas de Dados: Grafos e Árvores',
  'Gestão Ágil com Scrum & Kanban',
  'DevOps, CI/CD e Chaos Engineering',
  'Segurança Ofensiva & Prevenção de Falhas',
  'Fisiologia e Biologia do Corpo Humano',
];

const STORAGE_KEY_GEN_SETTINGS = 'trailup_gen_settings';
const STORAGE_KEY_SUPABASE = 'trailup_supabase_config';

export const GeneratorModal: React.FC<GeneratorModalProps> = ({
  isOpen,
  onClose,
  onDeckGenerated,
}) => {
  // Tabs: 'batch-all' | 'single' | 'keys-config'
  const [activeTab, setActiveTab] = useState<'batch-all' | 'single' | 'keys-config'>('batch-all');

  // Input & Upload State
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [attachments, setAttachments] = useState<UploadedSourceAttachment[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Settings & Controls
  const [targetProfile, setTargetProfile] = useState<BrainHexType>('Achiever');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PERSONA_BLUEPRINT_CONFIGS['Achiever'].presets[0].id
  );
  const [showBlueprintDetails, setShowBlueprintDetails] = useState<boolean>(true);
  const [rankLevel, setRankLevel] = useState<'Novato' | 'Aprendiz' | 'Guardião' | 'Mestre' | 'Ancião'>('Guardião');
  const [slideCountMode, setSlideCountMode] = useState<'auto' | 'custom'>('auto');
  const [manualSlideCount, setManualSlideCount] = useState<number>(9);
  const [narrativeStyle, setNarrativeStyle] = useState<'rpg-story' | 'practical-technical' | 'balanced'>('balanced');
  const [customDirectives, setCustomDirectives] = useState('');

  // Multi-Key & Rotation State
  const [settings, setSettings] = useState<GenerationSettings>({
    preferredModel: 'gemini-3.7-flash',
    rotateModels: true,
    delaySeconds: 3,
    autoSaveSupabase: true,
    slideCountMode: 'auto',
    customApiKeys: ['', '', '', '', '', '', '', ''],
  });

  const [serverKeysDetected, setServerKeysDetected] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Batch Generation State for 7 Profiles
  const [batchStates, setBatchStates] = useState<Record<BrainHexType, ProfileBatchItemState>>(() => {
    const initial: Partial<Record<BrainHexType, ProfileBatchItemState>> = {};
    ALL_BRAINHEX_PROFILES.forEach((p) => {
      initial[p] = { profile: p, status: 'idle', progressPercent: 0 };
    });
    return initial as Record<BrainHexType, ProfileBatchItemState>;
  });

  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(-1);
  const [cooldownCountdown, setCooldownCountdown] = useState<number>(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Load Settings from LocalStorage & Server Keys status
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_GEN_SETTINGS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.preferredModel === 'gemini-2.5-flash' || parsed.preferredModel === 'gemini-2.5-flash-lite') {
          parsed.preferredModel = 'gemini-3.7-flash';
        }
        setSettings((prev) => ({ ...prev, ...parsed }));
        if (parsed.slideCountMode) {
          setSlideCountMode(parsed.slideCountMode);
        }
      } catch (e) {}
    }

    fetch('/api/keys-status')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.keysCount === 'number') {
          setServerKeysDetected(data.keysCount);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = (newSettings: GenerationSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY_GEN_SETTINGS, JSON.stringify(newSettings));
  };

  if (!isOpen) return null;

  const activeTheme = BRAIN_HEX_PROFILES[targetProfile];

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper to determine category icon
  const getFileCategory = (mime: string, name: string): UploadedSourceAttachment['fileTypeCategory'] => {
    const lower = name.toLowerCase();
    if (mime.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
    if (mime.includes('audio') || lower.match(/\.(mp3|wav|m4a|ogg|aac|flac)$/)) return 'audio';
    if (mime.includes('video') || lower.match(/\.(mp4|webm|mov|mkv)$/)) return 'video';
    if (lower.match(/\.(pptx|ppt|key)$/)) return 'presentation';
    if (lower.match(/\.(docx|doc|rtf|odt)$/)) return 'document';
    if (mime.includes('text') || lower.match(/\.(txt|md|markdown|json|csv|log)$/)) return 'text';
    return 'other';
  };

  // Process selected or dropped files
  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setErrorMsg(null);
    playSoundEffect('quest_check');

    for (const file of fileArray) {
      const mime = file.type || 'application/octet-stream';
      const category = getFileCategory(mime, file.name);

      // Plain text formats: read text content
      if (
        category === 'text' ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.markdown') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.csv')
      ) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const newAtt: UploadedSourceAttachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: file.name,
            size: file.size,
            mimeType: mime || 'text/plain',
            fileTypeCategory: category,
            textContent: text,
            previewSnippet: text.slice(0, 140),
          };
          setAttachments((prev) => [...prev, newAtt]);
          if (!topic.trim()) {
            setTopic(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
          }
        };
        reader.readAsText(file);
      } else {
        // Binary/Multimodal formats (PDF, DOCX, PPTX, Audio, Video): read Base64
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64Data = dataUrl.split(',')[1] || '';
          const newAtt: UploadedSourceAttachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: file.name,
            size: file.size,
            mimeType: mime,
            fileTypeCategory: category,
            dataBase64: base64Data,
            previewSnippet: `Arquivo ${category.toUpperCase()} carregado (${formatFileSize(file.size)})`,
          };
          setAttachments((prev) => [...prev, newAtt]);
          if (!topic.trim()) {
            setTopic(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    playSoundEffect('slide_prev');
  };

  // Helper to trigger upload to Supabase
  const uploadDeckToSupabase = async (deckToUpload: DeckData): Promise<string | undefined> => {
    const supabaseRaw = localStorage.getItem(STORAGE_KEY_SUPABASE);
    if (!supabaseRaw) return undefined;

    try {
      const supaConfig = JSON.parse(supabaseRaw);
      if (!supaConfig.url || !supaConfig.anonKey) return undefined;

      const fileName = `${deckToUpload.targetProfile}_${deckToUpload.title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
      const fileContent = generateInteractiveHtml(deckToUpload);

      const res = await fetch('/api/supabase/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: supaConfig.url,
          anonKey: supaConfig.anonKey,
          bucketName: supaConfig.bucketName || 'trailup-slides',
          fileName,
          fileContent,
          contentType: 'text/html',
        }),
      });

      const data = await res.json();
      if (data.success && data.publicUrl) {
        return data.publicUrl;
      }
    } catch (e) {
      console.warn('Supabase auto-upload error:', e);
    }
    return undefined;
  };

  // Build payload attachments array for API
  const prepareApiAttachments = () => {
    return attachments.map((att) => ({
      name: att.name,
      mimeType: att.mimeType,
      dataBase64: att.dataBase64,
      textContent: att.textContent,
    }));
  };

  // 1. Batch Generation for ALL 7 Profiles with Multi-Key Rotation and Proportional Slide Count
  const handleStartBatchAllProfiles = async () => {
    const hasSource = topic.trim().length > 0 || sourceText.trim().length > 0 || attachments.length > 0;
    if (!hasSource) {
      setErrorMsg('Por favor, informe um tema, envie um arquivo ou digite um texto base para a forja dos slides.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    playSoundEffect('wardrum');

    const validCustomKeys = settings.customApiKeys.filter((k) => k && k.trim().length > 10);
    const apiAttachments = prepareApiAttachments();

    // Reset batch state
    const newStates: Record<BrainHexType, ProfileBatchItemState> = { ...batchStates };
    ALL_BRAINHEX_PROFILES.forEach((p) => {
      newStates[p] = { profile: p, status: 'idle', progressPercent: 0 };
    });
    setBatchStates({ ...newStates });

    for (let i = 0; i < ALL_BRAINHEX_PROFILES.length; i++) {
      const currentProfile = ALL_BRAINHEX_PROFILES[i];
      const pTheme = BRAIN_HEX_PROFILES[currentProfile];
      setCurrentBatchIndex(i);

      // Set status to generating
      setBatchStates((prev) => ({
        ...prev,
        [currentProfile]: {
          ...prev[currentProfile],
          status: 'generating',
          progressPercent: 30,
        },
      }));

      playSoundEffect('mystic');

      let generatedDeck: DeckData | null = null;
      let modelUsedStr = settings.preferredModel;
      let keyIdxUsed = 1;

      const pBlueprint = PERSONA_BLUEPRINT_CONFIGS[currentProfile];
      const pPreset = pBlueprint?.presets[0];

      try {
        const res = await fetch('/api/generate-deck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim() || 'Apresentação Baseada em Conteúdo',
            sourceText: sourceText.trim(),
            targetProfile: currentProfile,
            rankLevel,
            slideCount: slideCountMode === 'auto' ? 'auto' : manualSlideCount,
            slideCountMode,
            narrativeStyle,
            customDirectives,
            personaBlueprintPreset: pPreset?.label || '',
            personaSpecificPrompt: `${pBlueprint?.geminiPersonaPrompt || ''}\n${pPreset?.specificDirective || ''}`,
            preferredModel: settings.preferredModel,
            rotateModels: settings.rotateModels,
            customApiKeys: validCustomKeys,
            attachments: apiAttachments,
          }),
        });

        const data = await res.json();

        if (data.success && data.deck) {
          modelUsedStr = data.meta?.modelUsed || settings.preferredModel;
          keyIdxUsed = data.meta?.keyIndexUsed || 1;

          let finalSlides: SlideData[] = Array.isArray(data.deck.slides)
            ? data.deck.slides.map((s: SlideData, sIdx: number) => ({
                ...s,
                id: s.id || `slide-${sIdx + 1}`,
              }))
            : [];

          if (finalSlides.length < 6) {
            const fallbackDeck = generateClientFallbackDeck(
              topic.trim() || data.deck.title || 'Conteúdo Fornecido',
              currentProfile,
              rankLevel,
              8,
              sourceText
            );
            const remainingFallback = fallbackDeck.slides.slice(finalSlides.length);
            finalSlides = [...finalSlides, ...remainingFallback].map((s, sIdx) => ({
              ...s,
              id: `slide-${sIdx + 1}`,
            }));
          }

          generatedDeck = {
            id: `deck-${Date.now()}-${currentProfile}`,
            title: data.deck.title || `${topic || 'Trilha'}: ${pTheme.archetype}`,
            subtitle: data.deck.subtitle || `Trilha de ${pTheme.archetype}`,
            subject: data.deck.subject || topic || 'Conhecimento Geral',
            targetProfile: currentProfile,
            rankLevel,
            themeConfig: pTheme,
            createdAt: new Date().toISOString().split('T')[0],
            author: 'TrailUp AI Master',
            estimatedMinutes: data.deck.estimatedMinutes || finalSlides.length * 2,
            tags: data.deck.tags || [topic || 'Conteúdo', currentProfile, 'TrailUp'],
            slides: finalSlides,
          };
        } else {
          // Intelligent fallback
          generatedDeck = generateClientFallbackDeck(
            topic.trim() || 'Conteúdo Fornecido',
            currentProfile,
            rankLevel,
            manualSlideCount,
            sourceText
          );
        }
      } catch (err: any) {
        console.warn(`[Batch] Erro ao gerar perfil ${currentProfile}, usando fallback:`, err);
        generatedDeck = generateClientFallbackDeck(
          topic.trim() || 'Conteúdo Fornecido',
          currentProfile,
          rankLevel,
          manualSlideCount,
          sourceText
        );
      }

      // Supabase Upload Step if enabled
      let publicUrl: string | undefined = undefined;
      if (settings.autoSaveSupabase && generatedDeck) {
        setBatchStates((prev) => ({
          ...prev,
          [currentProfile]: {
            ...prev[currentProfile],
            status: 'uploading_supabase',
            progressPercent: 75,
          },
        }));

        publicUrl = await uploadDeckToSupabase(generatedDeck);
      }

      // Mark Profile Completed
      setBatchStates((prev) => ({
        ...prev,
        [currentProfile]: {
          profile: currentProfile,
          status: 'completed',
          deck: generatedDeck!,
          modelUsed: modelUsedStr,
          keyIndexUsed: keyIdxUsed,
          supabasePublicUrl: publicUrl,
          progressPercent: 100,
        },
      }));

      playSoundEffect('quiz_correct');

      // Rate limit cooldown delay between profile generations (except last)
      if (i < ALL_BRAINHEX_PROFILES.length - 1 && settings.delaySeconds > 0) {
        for (let countdown = settings.delaySeconds; countdown > 0; countdown--) {
          setCooldownCountdown(countdown);
          setBatchStates((prev) => {
            const nextProfile = ALL_BRAINHEX_PROFILES[i + 1];
            return {
              ...prev,
              [nextProfile]: {
                ...prev[nextProfile],
                status: 'waiting_delay',
              },
            };
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCooldownCountdown(0);
      }
    }

    setIsLoading(false);
    setCurrentBatchIndex(-1);
    playSoundEffect('level_up');
  };

  // 2. Single Deck Generation
  const handleGenerateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasSource = topic.trim().length > 0 || sourceText.trim().length > 0 || attachments.length > 0;
    if (!hasSource) {
      setErrorMsg('Por favor, informe um tema ou anexe um arquivo/texto base.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    playSoundEffect('mystic');

    const validCustomKeys = settings.customApiKeys.filter((k) => k && k.trim().length > 10);
    const apiAttachments = prepareApiAttachments();

    const activeBlueprint = getPersonaBlueprint(targetProfile);
    const activePreset = activeBlueprint.presets.find((p) => p.id === selectedPresetId) || activeBlueprint.presets[0];

    try {
      const response = await fetch('/api/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim() || 'Apresentação Personalizada',
          sourceText: sourceText.trim(),
          targetProfile,
          rankLevel,
          slideCount: slideCountMode === 'auto' ? 'auto' : manualSlideCount,
          slideCountMode,
          narrativeStyle,
          customDirectives,
          personaBlueprintPreset: activePreset?.label || '',
          personaSpecificPrompt: `${activeBlueprint.geminiPersonaPrompt}\n${activePreset?.specificDirective || ''}`,
          preferredModel: settings.preferredModel,
          rotateModels: settings.rotateModels,
          customApiKeys: validCustomKeys,
          attachments: apiAttachments,
        }),
      });

      const data = await response.json();

      if (data.success && data.deck) {
        const fullDeck: DeckData = {
          id: `deck-${Date.now()}`,
          title: data.deck.title || topic || 'Apresentação TrailUp',
          subtitle: data.deck.subtitle || `Trilha de ${activeTheme.archetype}`,
          subject: data.deck.subject || topic || 'Geral',
          targetProfile,
          rankLevel,
          themeConfig: activeTheme,
          createdAt: new Date().toISOString().split('T')[0],
          author: 'TrailUp AI Master',
          estimatedMinutes: data.deck.estimatedMinutes || (data.deck.slides?.length || 5) * 2,
          tags: data.deck.tags || [topic || 'Conteúdo', targetProfile, 'TrailUp'],
          slides: data.deck.slides.map((s: SlideData, i: number) => ({
            ...s,
            id: s.id || `slide-${i + 1}`,
          })),
        };

        if (settings.autoSaveSupabase) {
          uploadDeckToSupabase(fullDeck);
        }

        playSoundEffect('level_up');
        onDeckGenerated(fullDeck);
        onClose();
      } else {
        const fallbackDeck = generateClientFallbackDeck(
          topic.trim() || 'Conteúdo Base',
          targetProfile,
          rankLevel,
          manualSlideCount,
          sourceText
        );
        playSoundEffect('level_up');
        onDeckGenerated(fallbackDeck);
        onClose();
      }
    } catch (err: any) {
      const fallbackDeck = generateClientFallbackDeck(
        topic.trim() || 'Conteúdo Base',
        targetProfile,
        rankLevel,
        manualSlideCount,
        sourceText
      );
      playSoundEffect('level_up');
      onDeckGenerated(fallbackDeck);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    playSoundEffect('quest_check');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDownloadStandaloneHtml = (deck: DeckData) => {
    const htmlContent = generateInteractiveHtml(deck);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.targetProfile}_${deck.title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    playSoundEffect('quest_check');
  };

  const handleDownloadAllCompletedDecks = () => {
    const completed = (Object.values(batchStates) as ProfileBatchItemState[]).filter(
      (s) => s.status === 'completed' && s.deck
    );
    if (completed.length === 0) return;

    completed.forEach((item, idx) => {
      setTimeout(() => {
        handleDownloadStandaloneHtml(item.deck!);
      }, idx * 250);
    });
  };

  const totalKeysCount = serverKeysDetected + settings.customApiKeys.filter((k) => k.trim().length > 10).length;
  const completedBatchCount = (Object.values(batchStates) as ProfileBatchItemState[]).filter(
    (s) => s.status === 'completed'
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div
        className="relative w-full max-w-4xl rounded-2xl border p-4 sm:p-6 shadow-2xl my-4 max-h-[94vh] flex flex-col"
        style={{
          backgroundColor: '#0C0A09',
          borderColor: activeTheme.palette.secondary,
        }}
      >
        {/* Close Button */}
        <button
          id="btn-close-generator-modal"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div
          className="flex items-center gap-3 border-b pb-3 mb-4 shrink-0"
          style={{ borderColor: `${activeTheme.palette.secondary}60` }}
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border shadow"
            style={{
              backgroundColor: activeTheme.palette.primary,
              borderColor: activeTheme.palette.accent,
            }}
          >
            <Wand2 className="w-6 h-6 text-black" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-lg sm:text-xl font-bold text-white">
                Forja de Slides Multimodal TrailUp
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Arquivos • Áudio • Vídeo • Texto • Multi-Key
              </span>
            </div>
            <p className="text-xs text-stone-300">
              Faça upload de qualquer conteúdo ou arquivo. A IA gera apresentações proporcionais para os 7 perfis BrainHex de uma vez!
            </p>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex items-center gap-1.5 border-b border-stone-800 pb-2 mb-3 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('batch-all')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'batch-all'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gerar para os 7 Perfis BrainHex (Lote)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'single'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Perfil Específico</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('keys-config')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'keys-config'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Chaves ({totalKeysCount}) & Modelos Free</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* UNIVERSAL CONTENT INGESTION SECTION (Visible in both tabs) */}
          {activeTab !== 'keys-config' && (
            <div className="space-y-3 p-3.5 rounded-xl border border-stone-800 bg-stone-900/60">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Material Fonte / Arquivos / Conteúdo Base *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowTextInput(!showTextInput)}
                  className="text-[11px] text-stone-300 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
                >
                  <AlignLeft className="w-3 h-3" />
                  <span>{showTextInput ? 'Ocultar Caixa de Texto' : '+ Colar Texto / Markdown'}</span>
                </button>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  if (e.dataTransfer.files) {
                    handleFilesUpload(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 sm:p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDraggingFile
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-stone-700 bg-stone-950 hover:border-amber-400/60 hover:bg-stone-900/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files) handleFilesUpload(e.target.files);
                  }}
                  multiple
                  accept=".pdf,.txt,.md,.markdown,.json,.csv,.log,.docx,.pptx,.ppt,.mp3,.wav,.m4a,.ogg,.mp4,.webm"
                  className="hidden"
                />
                <UploadCloud className="w-8 h-8 text-amber-400 mb-2 animate-pulse" />
                <p className="text-xs font-bold text-white">
                  Arraste arquivos aqui ou <span className="text-amber-400 underline">clique para selecionar</span>
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  Suporta <strong>PDF, DOCX, PPTX, Markdown, TXT, Áudio (MP3/WAV), Vídeo (MP4)</strong> e planilhas.
                </p>
              </div>

              {/* Uploaded Files Chips */}
              {attachments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Arquivos Anexados ({attachments.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-xs text-stone-200"
                      >
                        {att.fileTypeCategory === 'pdf' && <FileIcon className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                        {att.fileTypeCategory === 'audio' && <FileAudio className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                        {att.fileTypeCategory === 'video' && <FileVideo className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        {att.fileTypeCategory === 'presentation' && <FileSpreadsheet className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                        {att.fileTypeCategory === 'text' && <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {att.fileTypeCategory === 'document' && <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        {att.fileTypeCategory === 'other' && <FileIcon className="w-3.5 h-3.5 text-stone-400 shrink-0" />}

                        <div className="flex flex-col">
                          <span className="font-semibold text-white truncate max-w-[170px]" title={att.name}>
                            {att.name}
                          </span>
                          <span className="text-[10px] text-stone-400">{formatFileSize(att.size)}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAttachment(att.id);
                          }}
                          className="p-1 text-stone-400 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Text / Markdown notes Area */}
              {showTextInput && (
                <div className="space-y-1 pt-1">
                  <label className="block text-[11px] font-bold text-stone-300">
                    Notas, Roteiro ou Conteúdo em Texto / Markdown:
                  </label>
                  <textarea
                    rows={4}
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="Cole aqui transcrições de reuniões, capítulos de apostilas, códigos, resumos em markdown..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                  />
                </div>
              )}

              {/* Topic / Title Input */}
              <div className="pt-1">
                <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                  Título / Tema Principal (Identificação da Trilha)
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ex: Arquitetura de Microsserviços, Algoritmos de Grafos..."
                  className="w-full px-3.5 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />

                {/* Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {TOPIC_SUGGESTIONS.slice(0, 4).map((sug, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setTopic(sug)}
                      className="px-2 py-0.5 rounded text-[10px] border border-stone-800 bg-stone-900 text-stone-300 hover:border-amber-400/50 hover:text-white"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Proportional / Dynamic Slide Count Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-800/80">
                {/* Dynamic vs Manual Slide Count */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                    Extensão de Slides
                  </label>
                  <select
                    value={slideCountMode}
                    onChange={(e) => setSlideCountMode(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white font-medium"
                  >
                    <option value="auto">Automático (Mais de 8 slides densos & imersivos)</option>
                    <option value="custom">Manual (Definir Quantidade Fixa)</option>
                  </select>
                  <span className="text-[10px] text-stone-400 block mt-0.5">
                    {slideCountMode === 'auto'
                      ? 'Gera automaticamente uma sequência completa (> 8 slides) com imersão ao conteúdo e desfechos variados.'
                      : `${manualSlideCount} slides completos com pedagogia BrainHex.`}
                  </span>
                </div>

                {/* If manual mode is chosen */}
                {slideCountMode === 'custom' && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                      Slides por Deck: {manualSlideCount}
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={18}
                      value={manualSlideCount}
                      onChange={(e) => setManualSlideCount(parseInt(e.target.value))}
                      className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer mt-1"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                    Nível de Rank
                  </label>
                  <select
                    value={rankLevel}
                    onChange={(e) => setRankLevel(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white"
                  >
                    <option value="Novato">Novato (Iniciante)</option>
                    <option value="Aprendiz">Aprendiz (Básico)</option>
                    <option value="Guardião">Guardião (Intermediário)</option>
                    <option value="Mestre">Mestre (Avançado)</option>
                    <option value="Ancião">Ancião (Expert)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                    Estilo Narrativo
                  </label>
                  <select
                    value={narrativeStyle}
                    onChange={(e) => setNarrativeStyle(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white"
                  >
                    <option value="balanced">Equilibrado (Técnico + RPG)</option>
                    <option value="rpg-story">Fantasia Épica Medieval</option>
                    <option value="practical-technical">Técnico Direto & Prático</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: BATCH GENERATION (ALL 7 PROFILES AT ONCE) */}
          {activeTab === 'batch-all' && (
            <div className="space-y-3">
              {/* Action Banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 shadow-lg">
                <div className="flex items-center gap-2.5 text-xs text-amber-200">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Forja para os <strong>7 Perfis BrainHex</strong> • Rotação de <strong>{totalKeysCount} chaves</strong> • Modelos Free
                  </span>
                </div>

                <button
                  type="button"
                  id="btn-start-batch-7-profiles"
                  disabled={isLoading || (!topic.trim() && attachments.length === 0 && !sourceText.trim())}
                  onClick={handleStartBatchAllProfiles}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isLoading
                      ? currentBatchIndex >= 0
                        ? `Forjando Perfil ${currentBatchIndex + 1}/7 (${ALL_BRAINHEX_PROFILES[currentBatchIndex]})...`
                        : 'Processando...'
                      : 'Forjar Apresentações para os 7 Perfis BrainHex'}
                  </span>
                </button>
              </div>

              {/* Cooldown Countdown Banner */}
              {cooldownCountdown > 0 && (
                <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-500/50 text-xs text-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>
                      Aguardando intervalo anti-rate-limit do Free Tier antes do próximo perfil...
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm px-2.5 py-0.5 rounded bg-blue-900 border border-blue-400">
                    {cooldownCountdown}s
                  </span>
                </div>
              )}

              {/* 7 Profiles Batch Status Cards Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                    Status das Apresentações por Arquétipo BrainHex
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-400">
                      {completedBatchCount} / 7 Concluídos
                    </span>
                    {completedBatchCount > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadAllCompletedDecks}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/40"
                      >
                        <PackageCheck className="w-3 h-3" />
                        <span>Baixar Todos ({completedBatchCount})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {ALL_BRAINHEX_PROFILES.map((p) => {
                    const pTheme = BRAIN_HEX_PROFILES[p];
                    const state = batchStates[p];
                    const isGeneratingThis = state.status === 'generating';
                    const isDone = state.status === 'completed';

                    return (
                      <div
                        key={p}
                        className={`p-3 rounded-xl border transition-all ${
                          isGeneratingThis
                            ? 'border-amber-400 bg-amber-950/20 ring-1 ring-amber-400 shadow-md'
                            : isDone
                            ? 'border-emerald-500/50 bg-emerald-950/20'
                            : 'border-stone-800 bg-stone-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <BrainHexAvatar profile={p} size="sm" className="w-7 h-7" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white">{p}</span>
                                <span className="text-[10px] text-stone-400">({pTheme.nomePt})</span>
                              </div>
                              <span className="text-[10px] text-stone-400 truncate block max-w-[160px]">
                                {pTheme.archetype}
                              </span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div>
                            {state.status === 'idle' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400">
                                Aguardando
                              </span>
                            )}
                            {state.status === 'waiting_delay' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-500/40 animate-pulse">
                                Intervalo...
                              </span>
                            )}
                            {state.status === 'generating' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <RotateCw className="w-2.5 h-2.5 animate-spin" />
                                <span>Forjando...</span>
                              </span>
                            )}
                            {state.status === 'uploading_supabase' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <Cloud className="w-2.5 h-2.5 animate-bounce" />
                                <span>Supabase...</span>
                              </span>
                            )}
                            {state.status === 'completed' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>{state.deck?.slides.length} slides</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Completed metadata & action buttons */}
                        {isDone && state.deck && (
                          <div className="pt-2 border-t border-stone-800/80 mt-2 flex items-center justify-between gap-1 text-[11px]">
                            <span className="text-stone-400 truncate max-w-[130px]" title={state.modelUsed}>
                              {state.modelUsed?.replace('gemini-', '')} (Chave #{state.keyIndexUsed})
                            </span>

                            <div className="flex items-center gap-1.5">
                              {/* Open Deck in App */}
                              <button
                                type="button"
                                onClick={() => {
                                  onDeckGenerated(state.deck!);
                                  onClose();
                                }}
                                className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black font-bold text-[10px]"
                                title="Carregar este deck no visualizador do app"
                              >
                                Ver no App
                              </button>

                              {/* Download HTML */}
                              <button
                                type="button"
                                onClick={() => handleDownloadStandaloneHtml(state.deck!)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300"
                                title="Baixar HTML Interativo"
                              >
                                <Download className="w-3 h-3" />
                              </button>

                              {/* Supabase Link */}
                              {state.supabasePublicUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(state.supabasePublicUrl!)}
                                  className="p-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300"
                                  title="Copiar Link Supabase"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SINGLE PROFILE GENERATION */}
          {activeTab === 'single' && (() => {
            const activeBlueprint = getPersonaBlueprint(targetProfile);
            const activePreset =
              activeBlueprint.presets.find((p) => p.id === selectedPresetId) ||
              activeBlueprint.presets[0];

            return (
              <form onSubmit={handleGenerateSingle} className="space-y-4">
                {/* BrainHex Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-amber-400">
                    Selecione o Perfil BrainHex Alvo
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_BRAINHEX_PROFILES.map((p) => {
                      const profileInfo = BRAIN_HEX_PROFILES[p];
                      const isSelected = targetProfile === p;

                      return (
                        <div
                          key={p}
                          onClick={() => {
                            setTargetProfile(p);
                            const nextBlueprint = getPersonaBlueprint(p);
                            setSelectedPresetId(nextBlueprint.presets[0].id);
                            playSoundEffect('slide_next');
                          }}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col items-center text-center ${
                            isSelected
                              ? 'border-amber-400 bg-white/10 shadow-md ring-1 ring-amber-400'
                              : 'border-stone-800 bg-stone-900/60 hover:border-stone-600'
                          }`}
                        >
                          <BrainHexAvatar profile={p} size="sm" className="w-8 h-8 mb-1" />
                          <span className="text-xs font-bold text-white">{profileInfo.perfil}</span>
                          <span className="text-[10px] text-stone-400 truncate w-full">
                            {profileInfo.nomePt}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Persona Pedagogical Blueprint & Strategy Box */}
                <div
                  className="p-3.5 sm:p-4 rounded-xl border space-y-3 transition-all"
                  style={{
                    backgroundColor: `${activeTheme.palette.background}90`,
                    borderColor: `${activeTheme.palette.primary}80`,
                  }}
                >
                  {/* Persona Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5"
                    style={{ borderColor: `${activeTheme.palette.primary}30` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg border shadow shrink-0"
                        style={{
                          backgroundColor: `${activeTheme.palette.primary}20`,
                          borderColor: activeTheme.palette.primary,
                        }}
                      >
                        {targetProfile === 'Daredevil' ? (
                          <Crosshair className="w-5 h-5 text-red-400" />
                        ) : targetProfile === 'Mastermind' ? (
                          <ScrollText className="w-5 h-5 text-purple-400" />
                        ) : targetProfile === 'Seeker' ? (
                          <BookOpen className="w-5 h-5 text-teal-400" />
                        ) : targetProfile === 'Conqueror' ? (
                          <Zap className="w-5 h-5 text-blue-400" />
                        ) : targetProfile === 'Achiever' ? (
                          <CheckSquare className="w-5 h-5 text-amber-400" />
                        ) : targetProfile === 'Socializer' ? (
                          <Layers className="w-5 h-5 text-orange-400" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            {activeBlueprint.title}
                          </h4>
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold border"
                            style={{
                              backgroundColor: `${activeTheme.palette.primary}30`,
                              borderColor: activeTheme.palette.primary,
                              color: activeTheme.palette.accent,
                            }}
                          >
                            {activeBlueprint.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-300">
                          {activeBlueprint.pedagogicalModel} • <em>"{activeTheme.mote}"</em>
                        </p>
                      </div>
                    </div>

                    {/* Toggle Blueprint Details */}
                    <button
                      type="button"
                      onClick={() => setShowBlueprintDetails(!showBlueprintDetails)}
                      className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 self-start sm:self-auto font-medium"
                    >
                      <span>{showBlueprintDetails ? 'Ocultar Blueprint' : 'Ver Sequência de Slides'}</span>
                      {showBlueprintDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Focus Highlight */}
                  <div className="text-xs text-stone-200 bg-black/40 p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300">Diretriz Pedagógica da Persona:</strong>{' '}
                      <span>{activeBlueprint.focusHighlight}</span>
                    </div>
                  </div>

                  {/* Persona Blueprint Presets Selector */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1.5">
                      Presets de Estrutura & Missão para {targetProfile}:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {activeBlueprint.presets.map((preset) => {
                        const isPresetSelected = (selectedPresetId || activeBlueprint.presets[0].id) === preset.id;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              setSelectedPresetId(preset.id);
                              playSoundEffect('quest_check');
                            }}
                            className={`p-2 rounded-lg border cursor-pointer transition-all text-left flex flex-col justify-between ${
                              isPresetSelected
                                ? 'bg-amber-400/20 border-amber-400 ring-1 ring-amber-400'
                                : 'bg-black/30 border-stone-800 hover:border-stone-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-white line-clamp-1">
                                  {preset.label}
                                </span>
                                {isPresetSelected && (
                                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                )}
                              </div>
                              <p className="text-[10px] text-stone-300 line-clamp-2">
                                {preset.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Collapsible Blueprint Slide Sequence */}
                  {showBlueprintDetails && (
                    <div className="pt-1 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                        Estrutura Pedagógica de Slides Gerada pelo Gemini para esta Persona:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-black/50 p-2 rounded-lg border border-white/5 text-[11px]">
                        {activeBlueprint.structureSummary.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-stone-300">
                            <span className="text-amber-400 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                              #{idx + 1}
                            </span>
                            <span className="leading-tight">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Directives */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-stone-300 mb-1">
                    Diretrizes Específicas / Observações Adicionais (Opcional)
                  </label>
                  <input
                    type="text"
                    value={customDirectives}
                    onChange={(e) => setCustomDirectives(e.target.value)}
                    placeholder={
                      targetProfile === 'Daredevil'
                        ? 'Ex: Focar em simulação de incidentes sob estresse e drills de resposta rápida...'
                        : targetProfile === 'Mastermind'
                        ? 'Ex: Incluir seções de lore profundo sobre teoremas fundamentais e diagramas de trade-off...'
                        : 'Ex: Focar em exemplos práticos de código, incluir desafio de alta dificuldade...'
                    }
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white placeholder-stone-500"
                  />
                </div>

                {/* Submit Single */}
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-stone-700 text-xs font-semibold text-stone-300 hover:bg-stone-800"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isLoading ? 'Forjando Slides...' : `Gerar para ${targetProfile}`}</span>
                  </button>
                </div>
              </form>
            );
          })()}

          {/* TAB 3: MULTI-KEY & FREE MODELS SETTINGS */}
          {activeTab === 'keys-config' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Pool Multi-Chaves Gemini API (Suporta até 8 Chaves)
                    </h4>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-bold">
                    {totalKeysCount} Chaves Ativas
                  </span>
                </div>

                <p className="text-xs text-stone-400">
                  O TrailUp alterna automaticamente entre as chaves em modo round-robin com failover inteligente para contornar quotas e limites de taxa (RPM / TPM) do free tier.
                </p>

                {/* 8 Custom Key Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {settings.customApiKeys.map((keyVal, idx) => (
                    <div key={idx}>
                      <label className="block text-[10px] font-bold text-stone-400 mb-0.5">
                        Chave Gemini #{idx + 1} {idx === 0 && serverKeysDetected > 0 ? '(+ Chave do Servidor Ativa)' : ''}
                      </label>
                      <input
                        type="password"
                        value={keyVal}
                        onChange={(e) => {
                          const updated = [...settings.customApiKeys];
                          updated[idx] = e.target.value;
                          handleSaveSettings({ ...settings, customApiKeys: updated });
                        }}
                        placeholder={idx === 0 && serverKeysDetected > 0 ? 'Chave principal detectada no servidor' : `AIzaSy... (Chave Opcional #${idx + 1})`}
                        className="w-full px-2.5 py-1.5 rounded border border-stone-800 bg-stone-950 text-xs text-stone-200 placeholder-stone-600 focus:border-amber-400 focus:outline-none font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Free Models & Delay Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-stone-800 bg-stone-900/60">
                {/* Free Model Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1.5">
                    Modelo Free Preferencial
                  </label>
                  <select
                    value={settings.preferredModel}
                    onChange={(e) =>
                      handleSaveSettings({
                        ...settings,
                        preferredModel: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Alta Disponibilidade & Estável)</option>
                    <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Ultra Rápido & Leve)</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash (Raciocínio Avançado)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Flash Lite)</option>
                    <option value="gemini-flash-latest">gemini-flash-latest (Flash Contínuo)</option>
                  </select>

                  <label className="flex items-center gap-2 mt-2.5 text-xs text-stone-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.rotateModels}
                      onChange={(e) =>
                        handleSaveSettings({
                          ...settings,
                          rotateModels: e.target.checked,
                        })
                      }
                      className="rounded text-amber-500"
                    />
                    <span>Rotacionar entre modelos Free automaticamente</span>
                  </label>
                </div>

                {/* Delay & Supabase AutoSave */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                      Intervalo Anti Rate-Limit: {settings.delaySeconds}s
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      value={settings.delaySeconds}
                      onChange={(e) =>
                        handleSaveSettings({
                          ...settings,
                          delaySeconds: parseInt(e.target.value),
                        })
                      }
                      className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer mt-1"
                    />
                    <span className="text-[10px] text-stone-400 block mt-0.5">
                      Protege contra bloqueios de requisições por minuto no tier gratuito.
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={settings.autoSaveSupabase}
                      onChange={(e) =>
                        handleSaveSettings({
                          ...settings,
                          autoSaveSupabase: e.target.checked,
                        })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span className="text-emerald-300 font-semibold">
                      Salvar automaticamente no Bucket do Supabase ao gerar
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-600/60 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

