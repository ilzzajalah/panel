import React, { useState, useEffect } from 'react';
import { Save, Check, FileCode, X, PackageOpen, Loader2 } from 'lucide-react';

interface CodeEditorProps {
  filename: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  onRunInstall?: () => void;
  installing?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  filename,
  initialContent,
  onSave,
  onClose,
  onRunInstall,
  installing = false
}) => {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    setContent(initialContent);
    setIsSaved(true);
  }, [initialContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(content);
      setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  const lines = content.split('\n');

  return (
    <div className="flex flex-col h-[520px] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-neutral-400" />
          <span className="font-mono font-medium text-white">{filename}</span>
          {!isSaved && (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Ada perubahan belum disimpan" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRunInstall && (filename.includes('package.json') || filename.includes('requirements.txt')) && (
            <button
              onClick={onRunInstall}
              disabled={installing}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Jalankan instalasi dependensi otomatis"
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageOpen className="w-3 h-3" />}
              <span>{installing ? 'Menginstall...' : filename.includes('package.json') ? 'Jalankan npm install' : 'Jalankan pip install'}</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isSaved 
                ? 'text-neutral-500 bg-neutral-800/50 cursor-default' 
                : 'text-black bg-white hover:bg-neutral-200'
            }`}
          >
            {isSaved ? <Check className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
            <span>{isSaving ? 'Menyimpan...' : isSaved ? 'Tersimpan' : 'Simpan (Ctrl+S)'}</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Editor Body */}
      <div className="flex-1 flex overflow-hidden font-mono text-xs">
        {/* Line Numbers */}
        <div className="w-12 py-3 bg-neutral-900/50 border-r border-neutral-800/60 text-right pr-3 text-neutral-600 select-none overflow-hidden leading-5">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea Area */}
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setIsSaved(false);
          }}
          spellCheck={false}
          className="flex-1 p-3 bg-transparent text-neutral-200 resize-none focus:outline-none overflow-y-auto leading-5 font-mono whitespace-pre"
        />
      </div>

      {/* Editor Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-900 border-t border-neutral-800 text-[11px] text-neutral-500 font-mono">
        <div>
          <span>{lines.length} Baris</span>
          <span className="mx-2">·</span>
          <span>{content.length} Karakter</span>
        </div>
        <div>
          <span>UTF-8</span>
          <span className="mx-2">·</span>
          <span>Tekan Ctrl+S untuk menyimpan</span>
        </div>
      </div>
    </div>
  );
};
