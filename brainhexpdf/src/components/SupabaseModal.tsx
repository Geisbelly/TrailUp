import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Link,
  Copy,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  FileCode,
  FileText,
  Sparkles,
  Key,
} from 'lucide-react';
import { DeckData, SupabaseConfig, SupabaseFileItem } from '../types';
import { playSoundEffect } from '../utils/audioSynth';
import { generateInteractiveHtml } from '../utils/deckExportUtils';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckData;
}

const STORAGE_KEY_SUPABASE = 'trailup_supabase_config';

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  deck,
}) => {
  const [config, setConfig] = useState<SupabaseConfig>({
    url: '',
    anonKey: '',
    bucketName: 'trailup-slides',
  });

  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    publicUrl?: string;
    message: string;
  } | null>(null);

  const [bucketFiles, setBucketFiles] = useState<SupabaseFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [uploadFormat, setUploadFormat] = useState<'html' | 'json'>('html');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SUPABASE);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  if (!isOpen) return null;

  const theme = deck.themeConfig;

  const handleSaveConfig = () => {
    localStorage.setItem(STORAGE_KEY_SUPABASE, JSON.stringify(config));
    playSoundEffect('quest_check');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus(null);
    handleSaveConfig();

    try {
      const res = await fetch('/api/supabase/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();

      if (data.success) {
        setConnectionStatus({
          tested: true,
          success: true,
          message: data.message,
        });
        playSoundEffect('quiz_correct');
        handleListFiles();
      } else {
        setConnectionStatus({
          tested: true,
          success: false,
          message: data.error || 'Falha ao conectar.',
        });
        playSoundEffect('quiz_wrong');
      }
    } catch (e: any) {
      setConnectionStatus({
        tested: true,
        success: false,
        message: e.message || 'Erro de rede.',
      });
      playSoundEffect('quiz_wrong');
    } finally {
      setIsTesting(false);
    }
  };

  const handleListFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/supabase/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setBucketFiles(data.files || []);
      }
    } catch (e) {
      console.warn('Could not list files:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleUploadDeck = async () => {
    if (!config.url || !config.anonKey) {
      setUploadResult({
        success: false,
        message: 'Preencha a URL e a Chave Anon do Supabase antes de salvar.',
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    handleSaveConfig();
    playSoundEffect('mystic');

    try {
      let fileName = '';
      let fileContent = '';
      let contentType = '';

      if (uploadFormat === 'html') {
        fileName = `${deck.targetProfile}_${deck.title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
        fileContent = generateInteractiveHtml(deck, deck.visualThematicArchetype);
        contentType = 'text/html';
      } else {
        fileName = `${deck.targetProfile}_${deck.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        fileContent = JSON.stringify(deck, null, 2);
        contentType = 'application/json';
      }

      const res = await fetch('/api/supabase/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: config.url,
          anonKey: config.anonKey,
          bucketName: config.bucketName,
          fileName,
          fileContent,
          contentType,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setUploadResult({
          success: true,
          publicUrl: data.publicUrl,
          message: 'Apresentação salva com sucesso no Bucket do Supabase!',
        });
        playSoundEffect('level_up');
        handleListFiles();
      } else {
        setUploadResult({
          success: false,
          message: data.error || 'Erro ao realizar upload no Supabase.',
        });
        playSoundEffect('quiz_wrong');
      }
    } catch (e: any) {
      setUploadResult({
        success: false,
        message: e.message || 'Erro inesperado durante o upload.',
      });
      playSoundEffect('quiz_wrong');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    playSoundEffect('quest_check');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div
        className="relative w-full max-w-2xl rounded-2xl border p-5 sm:p-7 shadow-2xl my-6"
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400 shadow">
            <Cloud className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-white">
              Integração com Supabase Storage Bucket
            </h3>
            <p className="text-xs text-stone-300">
              Salve suas apresentações diretamente no bucket na nuvem do Supabase para compartilhamento público.
            </p>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="space-y-3 mb-5 p-4 rounded-xl border border-stone-800 bg-stone-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Key className="w-3.5 h-3.5" />
              Configuração do Supabase
            </span>
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !config.url || !config.anonKey}
              className="text-xs px-3 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-40"
            >
              {isTesting ? 'Testando...' : 'Testar Conexão'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-300 mb-1">
                Supabase Project URL *
              </label>
              <input
                type="text"
                value={config.url}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://xyzproject.supabase.co"
                className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white placeholder-stone-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-300 mb-1">
                Storage Bucket Name *
              </label>
              <input
                type="text"
                value={config.bucketName}
                onChange={(e) => setConfig({ ...config, bucketName: e.target.value })}
                placeholder="trailup-slides"
                className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-300 mb-1">
              Supabase Anon Key *
            </label>
            <input
              type="password"
              value={config.anonKey}
              onChange={(e) => setConfig({ ...config, anonKey: e.target.value })}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-950 text-xs text-white placeholder-stone-500"
            />
          </div>

          {connectionStatus && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                connectionStatus.success
                  ? 'bg-emerald-950/60 border border-emerald-500/60 text-emerald-200'
                  : 'bg-rose-950/60 border border-rose-500/60 text-rose-200'
              }`}
            >
              {connectionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{connectionStatus.message}</span>
            </div>
          )}
        </div>

        {/* Upload Action Section */}
        <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/60 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Salvar Apresentação Atual: {deck.title}
              </h4>
              <p className="text-[11px] text-stone-400">
                Perfil: {deck.targetProfile} • {deck.slides.length} slides
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUploadFormat('html')}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  uploadFormat === 'html'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                HTML Interativo
              </button>
              <button
                type="button"
                onClick={() => setUploadFormat('json')}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  uploadFormat === 'json'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                JSON Deck
              </button>
            </div>
          </div>

          <button
            id="btn-upload-to-supabase"
            disabled={isUploading}
            onClick={handleUploadDeck}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>
              {isUploading ? 'Enviando para o Bucket...' : 'Fazer Upload Agora para o Supabase'}
            </span>
          </button>

          {uploadResult && (
            <div
              className={`p-3 rounded-lg text-xs space-y-2 ${
                uploadResult.success
                  ? 'bg-emerald-950/60 border border-emerald-500/60 text-emerald-200'
                  : 'bg-rose-950/60 border border-rose-500/60 text-rose-200'
              }`}
            >
              <p className="font-semibold">{uploadResult.message}</p>
              {uploadResult.publicUrl && (
                <div className="flex items-center gap-2 pt-1 border-t border-emerald-800/40">
                  <input
                    type="text"
                    readOnly
                    value={uploadResult.publicUrl}
                    className="flex-1 bg-black/50 border border-emerald-700/50 rounded px-2 py-1 text-[11px] text-stone-200"
                  />
                  <button
                    onClick={() => handleCopyLink(uploadResult.publicUrl!)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-[11px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                  <a
                    href={uploadResult.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded bg-stone-800 text-stone-300 hover:text-white"
                    title="Abrir em Nova Aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bucket File List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              Arquivos no Bucket ({bucketFiles.length})
            </span>
            <button
              onClick={handleListFiles}
              disabled={isLoadingFiles}
              className="text-[11px] text-stone-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-stone-800 bg-stone-950 p-2 space-y-1.5">
            {bucketFiles.length > 0 ? (
              bucketFiles.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-stone-900/60 hover:bg-stone-900 text-xs text-stone-300"
                >
                  <div className="flex items-center gap-2 truncate max-w-xs sm:max-w-md">
                    {f.name.endsWith('.html') ? (
                      <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                    <span className="truncate">{f.name}</span>
                  </div>

                  {f.publicUrl && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopyLink(f.publicUrl!)}
                        className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200"
                      >
                        {copiedUrl === f.publicUrl ? 'Copiado!' : 'Copiar Link'}
                      </button>
                      <a
                        href={f.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-stone-400 hover:text-white p-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-stone-500 py-3">
                Nenhum arquivo listado ou bucket ainda não consultado.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

