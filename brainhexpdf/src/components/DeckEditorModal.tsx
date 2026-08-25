import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Sparkles,
  Code2,
  CheckSquare,
  HelpCircle,
  FileText,
  Save,
  Copy,
  CheckCircle2,
  Check,
  Eye,
  EyeOff,
  Lightbulb,
  Image as ImageIcon,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { DeckData, SlideData, SlideLayout, SlideType, QuizOption } from '../types';
import { playSoundEffect } from '../utils/audioSynth';
import { InteractiveQuiz } from './InteractiveQuiz';

interface DeckEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckData;
  onSaveDeck: (updatedDeck: DeckData) => void;
}

export const DeckEditorModal: React.FC<DeckEditorModalProps> = ({
  isOpen,
  onClose,
  deck,
  onSaveDeck,
}) => {
  const [currentDeck, setCurrentDeck] = useState<DeckData>(deck);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [showQuizPreview, setShowQuizPreview] = useState<boolean>(false);
  const [isGeneratingIllustration, setIsGeneratingIllustration] = useState<boolean>(false);

  if (!isOpen) return null;

  const activeSlide = currentDeck.slides[selectedSlideIndex] || currentDeck.slides[0];
  const theme = currentDeck.themeConfig;

  const handleUpdateSlide = (updatedFields: Partial<SlideData>) => {
    const updatedSlides = [...currentDeck.slides];
    updatedSlides[selectedSlideIndex] = {
      ...updatedSlides[selectedSlideIndex],
      ...updatedFields,
    };
    setCurrentDeck({ ...currentDeck, slides: updatedSlides });
  };

  const handleToggleQuiz = (enabled: boolean) => {
    if (enabled) {
      const defaultQuiz = {
        question: `Desafio Prático: Qual é o conceito central sobre ${activeSlide.title || 'este tópico'}?`,
        options: [
          {
            id: `opt-${Date.now()}-1`,
            text: activeSlide.keyTakeaways?.[0] || 'Aplicar as boas práticas arquiteturais e conformidade de engenharia.',
            isCorrect: true,
            explanation: 'Correto! Resposta em conformidade com as diretrizes fundamentais da disciplina.',
          },
          {
            id: `opt-${Date.now()}-2`,
            text: 'Ignorar validações intermediárias para priorizar entregas sem documentação.',
            isCorrect: false,
            explanation: 'Incorreto. A ausência de validação compromete a estabilidade sistêmica.',
          },
          {
            id: `opt-${Date.now()}-3`,
            text: 'Desativar observabilidade e registros de erro em ambientes críticos.',
            isCorrect: false,
            explanation: 'Incorreto. A observabilidade é pilar mandatório para diagnósticos em tempo real.',
          },
        ],
      };
      handleUpdateSlide({
        quiz: defaultQuiz,
        interactiveType: 'quiz',
      });
      playSoundEffect('quiz_correct');
    } else {
      handleUpdateSlide({
        quiz: undefined,
        interactiveType: activeSlide.interactiveType === 'quiz' ? 'none' : activeSlide.interactiveType,
      });
    }
  };

  const handleUpdateQuizQuestion = (questionText: string) => {
    if (!activeSlide.quiz) return;
    handleUpdateSlide({
      quiz: {
        ...activeSlide.quiz,
        question: questionText,
      },
    });
  };

  const handleUpdateOption = (index: number, updated: Partial<QuizOption>) => {
    if (!activeSlide.quiz) return;
    const newOptions = [...activeSlide.quiz.options];
    newOptions[index] = {
      ...newOptions[index],
      ...updated,
    };
    handleUpdateSlide({
      quiz: {
        ...activeSlide.quiz,
        options: newOptions,
      },
    });
  };

  const handleSetCorrectOption = (correctIndex: number) => {
    if (!activeSlide.quiz) return;
    const newOptions = activeSlide.quiz.options.map((opt, i) => ({
      ...opt,
      isCorrect: i === correctIndex,
    }));
    handleUpdateSlide({
      quiz: {
        ...activeSlide.quiz,
        options: newOptions,
      },
    });
    playSoundEffect('quest_check');
  };

  const handleAddOption = () => {
    if (!activeSlide.quiz || activeSlide.quiz.options.length >= 6) return;
    const newOpt: QuizOption = {
      id: `opt-${Date.now()}-${activeSlide.quiz.options.length + 1}`,
      text: 'Nova alternativa de resposta...',
      isCorrect: false,
      explanation: 'Justificativa técnica para esta opção.',
    };
    handleUpdateSlide({
      quiz: {
        ...activeSlide.quiz,
        options: [...activeSlide.quiz.options, newOpt],
      },
    });
  };

  const handleRemoveOption = (index: number) => {
    if (!activeSlide.quiz || activeSlide.quiz.options.length <= 2) return;
    const newOptions = activeSlide.quiz.options.filter((_, i) => i !== index);
    // Ensure at least one option remains correct
    const hasCorrect = newOptions.some((o) => o.isCorrect);
    if (!hasCorrect && newOptions.length > 0) {
      newOptions[0].isCorrect = true;
    }
    handleUpdateSlide({
      quiz: {
        ...activeSlide.quiz,
        options: newOptions,
      },
    });
  };

  const handleAddSlide = () => {
    const newSlide: SlideData = {
      id: `slide-${Date.now()}`,
      type: 'concept_breakdown',
      title: 'Novo Slide de Conteúdo',
      subtitle: 'Conceito e Exploração',
      contentParagraphs: ['Insira aqui os parágrafos explicativos deste slide.'],
      keyTakeaways: ['Destaque 1', 'Destaque 2'],
      layout: 'split-character',
      rpgQuest: {
        questName: 'Missão Adicional',
        xpValue: 150,
        difficulty: 'Fácil',
      },
    };
    const updated = [...currentDeck.slides, newSlide];
    setCurrentDeck({ ...currentDeck, slides: updated });
    setSelectedSlideIndex(updated.length - 1);
    playSoundEffect('slide_next');
  };

  const handleDeleteSlide = (index: number) => {
    if (currentDeck.slides.length <= 1) return;
    const updated = currentDeck.slides.filter((_, i) => i !== index);
    setCurrentDeck({ ...currentDeck, slides: updated });
    setSelectedSlideIndex(Math.max(0, index - 1));
    playSoundEffect('slide_prev');
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentDeck.slides.length) return;

    const updated = [...currentDeck.slides];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setCurrentDeck({ ...currentDeck, slides: updated });
    setSelectedSlideIndex(targetIndex);
  };

  const handleSave = () => {
    onSaveDeck(currentDeck);
    playSoundEffect('quest_check');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div
        className="relative w-full max-w-5xl rounded-2xl border p-4 sm:p-6 shadow-2xl my-4 max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: theme.palette.background,
          borderColor: theme.palette.secondary,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: `${theme.palette.secondary}60` }}>
          <div>
            <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Editor de Apresentação: {currentDeck.title}
            </h3>
            <p className="text-xs text-stone-300">
              Personalize textos, ordene slides, ajuste desafios interativos e código.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-save-deck-changes"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-black shadow transition-transform hover:scale-105"
              style={{ backgroundColor: theme.palette.primary }}
            >
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout: Left list of slides + Right Editor */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden">
          {/* Left Slide List */}
          <div className="md:col-span-4 border-r border-stone-800 pr-2 flex flex-col overflow-y-auto max-h-[65vh] space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Slides ({currentDeck.slides.length})
              </span>
              <button
                id="btn-add-new-slide"
                onClick={handleAddSlide}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>

            {currentDeck.slides.map((s, idx) => {
              const isSelected = selectedSlideIndex === idx;
              return (
                <div
                  key={s.id || idx}
                  onClick={() => setSelectedSlideIndex(idx)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-amber-400 bg-white/10 shadow-sm'
                      : 'border-stone-800 bg-stone-900/60 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs font-mono font-bold text-stone-400">{idx + 1}.</span>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-white truncate">{s.title}</p>
                      <p className="text-[10px] text-stone-400 uppercase">{s.type}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <button
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(idx, 'up');
                      }}
                      className="p-1 text-stone-400 hover:text-white disabled:opacity-30"
                    >
                      <MoveUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={idx === currentDeck.slides.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(idx, 'down');
                      }}
                      className="p-1 text-stone-400 hover:text-white disabled:opacity-30"
                    >
                      <MoveDown className="w-3.5 h-3.5" />
                    </button>
                    {currentDeck.slides.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSlide(idx);
                        }}
                        className="p-1 text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Slide Form Editor */}
          <div className="md:col-span-8 overflow-y-auto max-h-[65vh] space-y-4 px-1">
            {activeSlide ? (
              <>
                {/* Title and Subtitle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                      Título do Slide
                    </label>
                    <input
                      type="text"
                      value={activeSlide.title}
                      onChange={(e) => handleUpdateSlide({ title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                      Subtítulo / Categoria
                    </label>
                    <input
                      type="text"
                      value={activeSlide.subtitle || ''}
                      onChange={(e) => handleUpdateSlide({ subtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Narrative Hook */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                    Gancho Narrativo / Lore RPG
                  </label>
                  <input
                    type="text"
                    value={activeSlide.narrativeText || ''}
                    onChange={(e) => handleUpdateSlide({ narrativeText: e.target.value })}
                    placeholder="Frase de ambientação épica para este slide..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                  />
                </div>

                {/* Paragraphs */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                    Conteúdo Principal (Parágrafos separados por nova linha)
                  </label>
                  <textarea
                    rows={4}
                    value={activeSlide.contentParagraphs.join('\n\n')}
                    onChange={(e) =>
                      handleUpdateSlide({
                        contentParagraphs: e.target.value.split('\n\n').filter(Boolean),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                  />
                </div>

                {/* Key Takeaways */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                    Pontos Cardeais de Maestria (1 por linha)
                  </label>
                  <textarea
                    rows={3}
                    value={(activeSlide.keyTakeaways || []).join('\n')}
                    onChange={(e) =>
                      handleUpdateSlide({
                        keyTakeaways: e.target.value.split('\n').filter(Boolean),
                      })
                    }
                    placeholder="Destaque principal 1&#10;Destaque principal 2"
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                  />
                </div>

                {/* Code Snippet Option */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                    Snippet de Código (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={activeSlide.codeSnippet?.code || ''}
                    onChange={(e) =>
                      handleUpdateSlide({
                        codeSnippet: e.target.value
                          ? { language: activeSlide.codeSnippet?.language || 'typescript', code: e.target.value }
                          : undefined,
                      })
                    }
                    placeholder="// Código demonstrativo..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 font-mono text-xs text-amber-200"
                  />
                </div>

                {/* Interactive Quiz / Desafio BrainHex Section */}
                <div className="p-3.5 rounded-xl border border-stone-700/80 bg-stone-950/60 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Quiz Interativo Gamificado (BrainHex)
                      </span>
                      {activeSlide.quiz && (
                        <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono">
                          Ativo (+150 XP)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSlide.quiz && (
                        <button
                          type="button"
                          onClick={() => setShowQuizPreview(!showQuizPreview)}
                          className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                          {showQuizPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-amber-400" />}
                          <span>{showQuizPreview ? 'Editar' : 'Pré-visualizar'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        id="btn-toggle-slide-quiz"
                        onClick={() => handleToggleQuiz(!activeSlide.quiz)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                          activeSlide.quiz
                            ? 'bg-rose-950/70 border border-rose-700 text-rose-300 hover:bg-rose-900'
                            : 'bg-amber-500 hover:bg-amber-400 text-black shadow'
                        }`}
                      >
                        {activeSlide.quiz ? (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover Quiz</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Injetar Quiz no Slide</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {activeSlide.quiz && (
                    <>
                      {showQuizPreview ? (
                        <div className="pt-2">
                          <InteractiveQuiz
                            quiz={activeSlide.quiz}
                            profile={currentDeck.targetProfile}
                            slideId={`preview-${activeSlide.id}`}
                            slideTitle={activeSlide.title}
                            primaryColor={theme.palette.primary}
                            accentColor={theme.palette.accent}
                            xpReward={150}
                          />
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          {/* Question Input */}
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-300 mb-1">
                              Pergunta de Múltipla Escolha
                            </label>
                            <input
                              type="text"
                              value={activeSlide.quiz.question}
                              onChange={(e) => handleUpdateQuizQuestion(e.target.value)}
                              placeholder="Ex: Qual é a melhor prática para isolar dependências?"
                              className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                            />
                          </div>

                          {/* Options List */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-300">
                                Alternativas (Marque o rádio da resposta correta)
                              </label>
                              {activeSlide.quiz.options.length < 5 && (
                                <button
                                  type="button"
                                  onClick={handleAddOption}
                                  className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Adicionar Opção</span>
                                </button>
                              )}
                            </div>

                            {activeSlide.quiz.options.map((opt, oidx) => {
                              const letter = String.fromCharCode(65 + oidx);
                              return (
                                <div
                                  key={opt.id || oidx}
                                  className={`p-2.5 rounded-xl border space-y-1.5 transition-all ${
                                    opt.isCorrect
                                      ? 'border-emerald-500/70 bg-emerald-950/30 ring-1 ring-emerald-500/30'
                                      : 'border-stone-800 bg-stone-900/60'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSetCorrectOption(oidx)}
                                      className={`px-2 py-0.5 rounded font-mono text-xs font-bold flex items-center gap-1 transition-colors ${
                                        opt.isCorrect
                                          ? 'bg-emerald-500 text-black'
                                          : 'bg-stone-800 text-stone-300 hover:bg-amber-500 hover:text-black'
                                      }`}
                                      title="Clique para marcar como resposta correta"
                                    >
                                      <span>{letter}</span>
                                      {opt.isCorrect && <Check className="w-3 h-3" />}
                                    </button>

                                    <input
                                      type="text"
                                      value={opt.text}
                                      onChange={(e) => handleUpdateOption(oidx, { text: e.target.value })}
                                      placeholder={`Texto da alternativa ${letter}...`}
                                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-700 bg-stone-900 text-xs text-white"
                                    />

                                    {activeSlide.quiz!.options.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveOption(oidx)}
                                        className="p-1 text-stone-500 hover:text-rose-400"
                                        title="Excluir alternativa"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Explanation input */}
                                  <div className="flex items-center gap-2 pl-7">
                                    <span className="text-[10px] text-stone-400 shrink-0 font-medium">
                                      Feedback:
                                    </span>
                                    <input
                                      type="text"
                                      value={opt.explanation || ''}
                                      onChange={(e) =>
                                        handleUpdateOption(oidx, { explanation: e.target.value })
                                      }
                                      placeholder={
                                        opt.isCorrect
                                          ? 'Explicação pedagógica do acerto...'
                                          : 'Por que esta opção está incorreta...'
                                      }
                                      className="flex-1 px-2 py-1 rounded border border-stone-800 bg-stone-950/70 text-[11px] text-stone-300"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Exemplo Visual Didático / Ilustração de Apoio */}
                <div className="p-3.5 rounded-xl border border-stone-800 bg-stone-900/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Exemplo Visual Didático • Guia de Estudo
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Imagem</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                handleUpdateSlide({ referenceImageDataUri: reader.result });
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={isGeneratingIllustration}
                        onClick={async () => {
                          if (isGeneratingIllustration) return;
                          setIsGeneratingIllustration(true);
                          try {
                            const res = await fetch('/api/generate-slide-illustration', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                slideTitle: activeSlide.title,
                                slideSubtopic: activeSlide.subtopic || activeSlide.title,
                                targetProfile: currentDeck.targetProfile,
                              }),
                            });
                            const data = await res.json();
                            if (data.success && data.imageDataUri) {
                              handleUpdateSlide({ referenceImageDataUri: data.imageDataUri });
                              playSoundEffect('level_up');
                            }
                          } finally {
                            setIsGeneratingIllustration(false);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1 shadow transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingIllustration ? 'animate-spin' : ''}`} />
                        <span>{isGeneratingIllustration ? 'Gerando...' : 'Gerar com IA'}</span>
                      </button>

                      {activeSlide.referenceImageDataUri && (
                        <button
                          type="button"
                          onClick={() => handleUpdateSlide({ referenceImageDataUri: undefined })}
                          className="p-1 rounded bg-stone-800 hover:bg-rose-950 text-stone-400 hover:text-rose-400 transition-colors"
                          title="Remover Imagem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {activeSlide.referenceImageDataUri ? (
                    <div className="mt-2 p-2 rounded-lg bg-black/50 border border-stone-800 flex flex-col items-center">
                      <img
                        src={activeSlide.referenceImageDataUri}
                        alt="Exemplo Visual"
                        className="max-h-44 object-contain rounded"
                      />
                      <span className="text-[10px] text-stone-400 mt-1">
                        Esta imagem será exibida com destaque para guiar os estudos do aluno.
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-400 italic">
                      Nenhuma imagem associada a este slide. Você pode fazer upload de um diagrama ou clicar em "Gerar com IA" para criar um infográfico no estilo do perfil.
                    </p>
                  )}
                </div>

                {/* Presenter Notes */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1">
                    Notas do Apresentador (Visíveis apenas no Modo Apresentador)
                  </label>
                  <textarea
                    rows={2}
                    value={activeSlide.presenterNotes || ''}
                    onChange={(e) => handleUpdateSlide({ presenterNotes: e.target.value })}
                    placeholder="Dicas para o palestrante, perguntas de engajamento..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 text-xs text-stone-300"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-400">Nenhum slide selecionado.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
