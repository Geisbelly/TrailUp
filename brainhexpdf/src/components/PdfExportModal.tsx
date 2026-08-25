import React, { useState } from 'react';
import {
  X,
  FileDown,
  Download,
  Code,
  Check,
  Sparkles,
  Printer,
  Share2,
  QrCode,
  Shield,
  Layers,
  BookOpen,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { DeckData } from '../types';
import { useDeckInteraction } from '../context/DeckInteractionContext';
import { playSoundEffect } from '../utils/audioSynth';
import { generateInteractiveHtml, generatePdfPageHtml } from '../utils/deckExportUtils';
import { getBrainHexBorderCss } from '../utils/brainHexBorderStyles';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckData;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  deck,
}) => {
  const { getExportableState } = useDeckInteraction();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);
  const [includePresenterNotes, setIncludePresenterNotes] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [copiedHtml, setCopiedHtml] = useState(false);

  if (!isOpen) return null;

  const theme = deck.themeConfig;

  // Generate High-Res PDF using jsPDF + html2canvas
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    playSoundEffect('mystic');

    try {
      // Create hidden printable container with complete theme styling and fonts
      const printContainer = document.createElement('div');
      printContainer.id = 'pdf-render-engine';
      printContainer.style.position = 'fixed';
      printContainer.style.top = '-9999px';
      printContainer.style.left = '-9999px';
      printContainer.style.width = pdfOrientation === 'landscape' ? '1120px' : '794px';
      printContainer.style.backgroundColor = theme.palette.background;
      printContainer.style.color = '#FFFFFF';
      printContainer.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";

      // Inject custom stylesheets & theme classes for html2canvas
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        :root {
          --primary: ${theme.palette.primary};
          --secondary: ${theme.palette.secondary};
          --accent: ${theme.palette.accent};
          --bg: ${theme.palette.background};
        }
        .font-cinzel { font-family: 'Cinzel', serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .frame-medieval {
          border: 1.5px solid ${theme.palette.accent}50;
          border-radius: 16px;
          background: radial-gradient(circle at top, ${theme.palette.primary}20, transparent 75%), rgba(12, 8, 22, 0.9);
          box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
        }
        .frame-indian {
          border: 2px solid ${theme.palette.accent};
          border-radius: 20px;
          background: radial-gradient(circle at top, rgba(245,158,11,0.2), transparent 70%), rgba(26, 10, 5, 0.9);
        }
        .frame-islamic {
          border: 2px solid ${theme.palette.primary};
          border-radius: 18px;
          background: radial-gradient(circle at top right, rgba(56,189,248,0.2), transparent 60%), rgba(4, 30, 30, 0.92);
        }
        .frame-eco {
          border: 2px solid ${theme.palette.primary};
          border-radius: 20px;
          background: radial-gradient(circle at top, rgba(16,185,129,0.2), transparent 70%), rgba(15, 23, 42, 0.92);
        }
        .frame-scrapbook {
          border: 2px dashed ${theme.palette.accent};
          border-radius: 16px;
          background: rgba(30, 15, 55, 0.94);
        }
        .frame-cyber {
          border: 1px solid ${theme.palette.primary};
          border-radius: 12px;
          background: rgba(2, 25, 20, 0.94);
          box-shadow: inset 0 0 25px rgba(6, 182, 212, 0.25);
        }
        .frame-royal {
          border: 2px solid ${theme.palette.accent};
          border-radius: 16px;
          background: rgba(11, 19, 43, 0.94);
        }
        ${getBrainHexBorderCss(theme)}
      `;
      printContainer.appendChild(styleTag);

      // Build High-Fidelity Themed HTML pages
      let pagesHtml = '';
      deck.slides.forEach((slide, idx) => {
        pagesHtml += generatePdfPageHtml(slide, deck, idx, pdfOrientation);
      });

      const pagesWrapper = document.createElement('div');
      pagesWrapper.innerHTML = pagesHtml;
      printContainer.appendChild(pagesWrapper);
      document.body.appendChild(printContainer);

      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'pt',
        format: 'a4',
      });

      const pages = pagesWrapper.children;
      for (let i = 0; i < pages.length; i++) {
        const pageElem = pages[i] as HTMLElement;
        const canvas = await html2canvas(pageElem, {
          scale: 2,
          useCORS: true,
          backgroundColor: theme.palette.background,
          logging: false,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = pdf.internal.pageSize.getHeight();

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      }

      document.body.removeChild(printContainer);

      const filename = `TrailUp_${deck.targetProfile}_${deck.title
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 30)}.pdf`;
      pdf.save(filename);

      playSoundEffect('level_up');
    } catch (e) {
      console.error('PDF export failed, falling back to window.print():', e);
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Generate Standalone HTML File
  const handleDownloadStandaloneHtml = () => {
    const htmlContent = generateInteractiveHtml(deck, undefined, getExportableState());
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrailUp_${deck.targetProfile}_Slides.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSoundEffect('level_up');
  };

  const handleCopyHtmlCode = () => {
    const htmlContent = generateInteractiveHtml(deck, undefined, getExportableState());
    navigator.clipboard.writeText(htmlContent);
    setCopiedHtml(true);
    playSoundEffect('quest_check');
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div
        className="relative w-full max-w-xl rounded-2xl border p-5 sm:p-7 shadow-2xl my-6"
        style={{
          backgroundColor: theme.palette.background,
          borderColor: theme.palette.secondary,
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 border-b pb-4" style={{ borderColor: `${theme.palette.secondary}60` }}>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl border shadow"
            style={{
              backgroundColor: theme.palette.primary,
              borderColor: theme.palette.accent,
            }}
          >
            <FileDown className="w-6 h-6 text-black" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-white">
              Exportar Slides da Apresentação
            </h3>
            <p className="text-xs text-stone-300">
              Gere documentos imprimíveis em alta resolução ou arquivo HTML interativo dos slides.
            </p>
          </div>
        </div>

        {/* Deck Summary Card */}
        <div
          className="p-3.5 rounded-xl border mb-4 text-xs"
          style={{
            borderColor: `${theme.palette.secondary}80`,
            backgroundColor: `${theme.palette.background}F0`,
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-white">{deck.title}</span>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold text-black"
              style={{ backgroundColor: theme.palette.primary }}
            >
              {deck.targetProfile}
            </span>
          </div>
          <p className="text-stone-300">
            {deck.slides.length} slides divididos por assuntos • Rank {deck.rankLevel} • {deck.subject}
          </p>
        </div>

        {/* Export Options */}
        <div className="space-y-4 mb-6">
          {/* Orientation Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 mb-1.5">
              Orientação do PDF
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPdfOrientation('landscape')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                  pdfOrientation === 'landscape'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'border-stone-800 bg-stone-900 text-stone-400'
                }`}
              >
                Paisagem (16:9 Slides)
              </button>
              <button
                type="button"
                onClick={() => setPdfOrientation('portrait')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                  pdfOrientation === 'portrait'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'border-stone-800 bg-stone-900 text-stone-400'
                }`}
              >
                Retrato (A4 Vertical)
              </button>
            </div>
          </div>

          {/* Quick Features Checklist */}
          <div className="space-y-2 text-xs text-stone-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => setIncludeCover(e.target.checked)}
                className="rounded bg-stone-900 border-stone-700 text-amber-500"
              />
              <span>Incluir Capa Temática & Insígnias de Conquista</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePresenterNotes}
                onChange={(e) => setIncludePresenterNotes(e.target.checked)}
                className="rounded bg-stone-900 border-stone-700 text-amber-500"
              />
              <span>Incluir Notas Pedagógicas de Cada Slide no Rodapé</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {/* Direct PDF Download */}
          <button
            id="btn-download-pdf-now"
            disabled={isExportingPdf}
            onClick={handleExportPdf}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-black shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-50"
            style={{ backgroundColor: theme.palette.primary }}
          >
            <Download className="w-4 h-4" />
            <span>
              {isExportingPdf ? 'Gerando PDF...' : 'Baixar Slides (PDF em Alta Resolução)'}
            </span>
          </button>

          {/* Standalone HTML File Download */}
          <button
            id="btn-download-html-standalone"
            onClick={handleDownloadStandaloneHtml}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-stone-700 bg-stone-900/90 text-xs font-semibold text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <Code className="w-4 h-4 text-amber-400" />
            <span>Baixar Arquivo HTML Interativo dos Slides (Offline & Responsivo)</span>
          </button>

          {/* Copy HTML Source */}
          <button
            onClick={handleCopyHtmlCode}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 pt-1"
          >
            {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-stone-400" />}
            <span>{copiedHtml ? 'Código HTML copiado para a área de transferência!' : 'Copiar Código HTML dos Slides'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
