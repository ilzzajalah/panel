import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Send, 
  Trash2, 
  ArrowDown, 
  Play, 
  ChevronDown, 
  AlertTriangle, 
  AlertCircle, 
  Wrench, 
  Copy, 
  Check, 
  ExternalLink, 
  HelpCircle, 
  X, 
  Terminal, 
  Loader2, 
  Sparkles, 
  RefreshCw, 
  BookOpen,
  ChevronUp,
  RotateCcw,
  Palette,
  Type
} from 'lucide-react';
import { analyzeConsoleLogs, DiagnosticIssue } from '../lib/diagnostics';

export type ConsoleThemeKey = 'dracula' | 'monokai' | 'solarized' | 'aether' | 'matrix' | 'cyberpunk';

export const CONSOLE_THEMES: Record<ConsoleThemeKey, {
  name: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  inputBgClass: string;
  headerBgClass: string;
  accentText: string;
  badgeBg: string;
  promptColor: string;
  timestampColor: string;
}> = {
  dracula: {
    name: 'Dracula',
    bgClass: 'bg-[#282a36]',
    textClass: 'text-[#f8f8f2]',
    borderClass: 'border-[#6272a4]/50',
    inputBgClass: 'bg-[#44475a]/70',
    headerBgClass: 'bg-[#21222c]',
    accentText: 'text-[#50fa7b]',
    badgeBg: 'bg-[#bd93f9]/20 text-[#bd93f9] border-[#bd93f9]/40',
    promptColor: 'text-[#bd93f9]',
    timestampColor: 'text-[#6272a4]'
  },
  monokai: {
    name: 'Monokai',
    bgClass: 'bg-[#272822]',
    textClass: 'text-[#f8f8f2]',
    borderClass: 'border-[#49483e]',
    inputBgClass: 'bg-[#3e3d32]',
    headerBgClass: 'bg-[#1e1f1c]',
    accentText: 'text-[#a6e22e]',
    badgeBg: 'bg-[#ae81ff]/20 text-[#ae81ff] border-[#ae81ff]/40',
    promptColor: 'text-[#f92672]',
    timestampColor: 'text-[#75715e]'
  },
  solarized: {
    name: 'Solarized Dark',
    bgClass: 'bg-[#002b36]',
    textClass: 'text-[#839496]',
    borderClass: 'border-[#073642]',
    inputBgClass: 'bg-[#073642]',
    headerBgClass: 'bg-[#00212b]',
    accentText: 'text-[#859900]',
    badgeBg: 'bg-[#268bd2]/20 text-[#268bd2] border-[#268bd2]/40',
    promptColor: 'text-[#268bd2]',
    timestampColor: 'text-[#586e75]'
  },
  aether: {
    name: 'Aether Neon',
    bgClass: 'bg-neutral-950',
    textClass: 'text-neutral-200',
    borderClass: 'border-neutral-800',
    inputBgClass: 'bg-neutral-900',
    headerBgClass: 'bg-neutral-900/90',
    accentText: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    promptColor: 'text-sky-400',
    timestampColor: 'text-neutral-500'
  },
  matrix: {
    name: 'Matrix Hacker',
    bgClass: 'bg-[#051105]',
    textClass: 'text-[#22c55e]',
    borderClass: 'border-[#15803d]',
    inputBgClass: 'bg-[#0d280d]',
    headerBgClass: 'bg-[#020a02]',
    accentText: 'text-[#4ade80]',
    badgeBg: 'bg-[#22c55e]/20 text-[#4ade80] border-[#22c55e]/40',
    promptColor: 'text-[#16a34a]',
    timestampColor: 'text-[#15803d]'
  },
  cyberpunk: {
    name: 'Cyberpunk Synth',
    bgClass: 'bg-[#120826]',
    textClass: 'text-[#f472b6]',
    borderClass: 'border-[#831843]',
    inputBgClass: 'bg-[#28104e]',
    headerBgClass: 'bg-[#0a0418]',
    accentText: 'text-[#38bdf8]',
    badgeBg: 'bg-[#f472b6]/20 text-[#f472b6] border-[#f472b6]/40',
    promptColor: 'text-[#f43f5e]',
    timestampColor: 'text-[#6b21a8]'
  }
};

interface ConsoleTerminalProps {
  logs: string[];
  status: string;
  onSendCommand: (command: string) => void;
  onClear: () => void;
}

export const ConsoleTerminal: React.FC<ConsoleTerminalProps> = ({
  logs,
  status,
  onSendCommand,
  onClear
}) => {
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [quickCmdOpen, setQuickCmdOpen] = useState(false);

  // Theme & Font Size State
  const [themeKey, setThemeKey] = useState<ConsoleThemeKey>(() => {
    return (localStorage.getItem('aether_console_theme') as ConsoleThemeKey) || 'dracula';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    return Number(localStorage.getItem('aether_console_fontsize')) || 13;
  });
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const activeTheme = CONSOLE_THEMES[themeKey] || CONSOLE_THEMES.dracula;

  const handleSelectTheme = (key: ConsoleThemeKey) => {
    setThemeKey(key);
    localStorage.setItem('aether_console_theme', key);
    setThemeDropdownOpen(false);
  };

  const handleFontSizeChange = (delta: number) => {
    setFontSize(prev => {
      const next = Math.min(20, Math.max(10, prev + delta));
      localStorage.setItem('aether_console_fontsize', String(next));
      return next;
    });
  };
  
  // Smart Scrolling State
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [unreadLogsCount, setUnreadLogsCount] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);

  // Diagnostics & Troubleshooting State
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const [activeTroubleshootTab, setActiveTroubleshootTab] = useState<'scan' | 'guides' | 'tools'>('scan');
  const [dismissedIssueId, setDismissedIssueId] = useState<string | null>(null);
  const [isDiagnosticBannerExpanded, setIsDiagnosticBannerExpanded] = useState(true);
  const [executingCmd, setExecutingCmd] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Real-time error diagnostic analysis
  const detectedIssue = useMemo(() => {
    return analyzeConsoleLogs(logs, status);
  }, [logs, status]);

  // Interactive bot prompt detection (e.g. WhatsApp Pairing Code / Input)
  const botInputPrompt = useMemo(() => {
    if (status !== 'running' || logs.length === 0) return null;
    const recent = logs.slice(-25).join(' ');
    if (
      recent.includes('Masukkan nomor WhatsApp') ||
      recent.includes('contoh: 628xxx') ||
      recent.includes('Pairing code') ||
      recent.includes('nomor WhatsApp')
    ) {
      return {
        type: 'whatsapp_number',
        title: '📱 WhatsApp Bot Membutuhkan Input Nomor',
        description: 'Script bot sedang aktif berjalan dan menunggu nomor WhatsApp Anda (format: 628xxx). Masukkan nomor Anda di kolom terminal bawah lalu tekan Enter untuk memperoleh Pairing Code WhatsApp.',
        placeholder: 'Masukkan nomor WhatsApp Anda (contoh: 628123456789)...'
      };
    }
    return null;
  }, [logs, status]);

  // Handle user scroll event to detect if they scrolled away from bottom
  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    
    // Distance from the bottom of scrollable area
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom <= 40;
    
    isAtBottomRef.current = isAtBottom;
    setUserScrolledUp(!isAtBottom);

    if (isAtBottom) {
      setUnreadLogsCount(0);
    }
  };

  // Keep scroll pinned to bottom ONLY when user is at bottom and autoScroll is active
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    if (autoScroll && isAtBottomRef.current) {
      // Pin to bottom instantly without smooth-scrolling jerkiness
      el.scrollTop = el.scrollHeight;
      setUnreadLogsCount(0);
    } else if (userScrolledUp) {
      setUnreadLogsCount(prev => prev + 1);
    }
  }, [logs, autoScroll]);

  // Explicit scroll-to-bottom action
  const scrollToBottom = (smooth = true) => {
    const el = viewportRef.current;
    if (!el) return;

    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    isAtBottomRef.current = true;
    setUserScrolledUp(false);
    setUnreadLogsCount(0);
  };

  const handleToggleAutoScroll = () => {
    const nextVal = !autoScroll;
    setAutoScroll(nextVal);
    if (nextVal) {
      scrollToBottom(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputVal.trim();
    if (!cmd) return;

    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
      onClear();
    } else {
      onSendCommand(cmd);
    }

    setHistory(prev => [cmd, ...prev.filter(c => c !== cmd).slice(0, 49)]);
    setHistoryIdx(-1);
    setInputVal('');
    
    // After user sends a command, jump to bottom to see its result
    setTimeout(() => scrollToBottom(true), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIdx < history.length - 1) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const prevIdx = historyIdx - 1;
        setHistoryIdx(prevIdx);
        setInputVal(history[prevIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  const handleExecuteQuick = (cmd: string) => {
    setExecutingCmd(cmd);
    onSendCommand(cmd);
    setTimeout(() => {
      setExecutingCmd(null);
      scrollToBottom(true);
    }, 1000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const renderAnsiText = (text: string) => {
    const formatted = text
      .replace(/\x1b\[31m/g, '<span class="text-rose-400">')
      .replace(/\x1b\[32m/g, '<span class="text-emerald-400">')
      .replace(/\x1b\[33m/g, '<span class="text-amber-400">')
      .replace(/\x1b\[34m/g, '<span class="text-blue-400">')
      .replace(/\x1b\[35m/g, '<span class="text-purple-400">')
      .replace(/\x1b\[36m/g, '<span class="text-cyan-400">')
      .replace(/\x1b\[90m/g, '<span class="text-neutral-500">')
      .replace(/\x1b\[0m/g, '</span>');

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  const quickCommands = [
    { label: 'npm install (Semua dep)', cmd: 'npm install' },
    { label: 'yarn install', cmd: 'yarn install' },
    { label: 'Yarn Reinstall & Clean Cache', cmd: 'rm -rf node_modules yarn.lock && yarn cache clean && yarn install' },
    { label: 'NPM Clean Reinstall', cmd: 'rm -rf node_modules package-lock.json && npm cache clean --force && npm install' },
    { label: 'Install Baileys Stack (WA Bot)', cmd: 'npm install @whiskeysockets/baileys @hapi/boom qrcode-terminal pino' },
    { label: 'Cek Modul Baileys', cmd: 'ls -la node_modules/@sairidev/baileys-new/ || ls -la node_modules/@whiskeysockets/baileys/' },
    { label: 'npm start', cmd: 'npm start' },
    { label: 'pip install -r requirements.txt', cmd: 'pip install -r requirements.txt' },
    { label: 'ls -la (Daftar berkas)', cmd: 'ls -la' },
    { label: 'cat package.json', cmd: 'cat package.json' }
  ];

  const guides = [
    {
      title: 'WhatsApp Bot (@whiskeysockets/baileys & @hapi/boom)',
      badge: 'WhatsApp Bot',
      color: 'border-emerald-800 bg-emerald-950/20 text-emerald-300',
      desc: 'Cara memasang dan menjalankan WhatsApp Multi-Device bot menggunakan Baileys.',
      steps: [
        'Buka tab "Paket & Plugins" di atas atau jalankan perintah instalasi di bawah.',
        'Perintah instalasi paket inti Baileys: npm install @whiskeysockets/baileys @hapi/boom qrcode-terminal pino',
        'Tunggu hingga terminal menampilkan status selesai (exit code 0).',
        'Pastikan script bot memanggil qrcode-terminal untuk menampilkan QR login.',
        'Klik tombol Start di atas dan scan QR Code yang muncul di layar terminal.'
      ],
      quickCmd: 'npm install @whiskeysockets/baileys @hapi/boom qrcode-terminal pino'
    },
    {
      title: 'Solusi: "Cannot find module ..."',
      badge: 'Node.js',
      color: 'border-emerald-800 bg-emerald-950/20 text-emerald-300',
      desc: 'Terjadi karena package npm yang di-require di script belum diinstall di server.',
      steps: [
        'Ketik di terminal bawah: npm install <nama-paket> (contoh: npm install discord.js)',
        'Jika Anda sudah memiliki package.json, cukup ketik: npm install',
        'Tunggu hingga terminal menampilkan status selesai (Done / Exit 0)',
        'Klik tombol Start / Restart di atas.'
      ],
      quickCmd: 'npm install'
    },
    {
      title: 'Solusi: "ModuleNotFoundError: No module named ..."',
      badge: 'Python',
      color: 'border-amber-800 bg-amber-950/20 text-amber-300',
      desc: 'Terjadi saat script Python mengimpor modul yang belum ada di virtualenv.',
      steps: [
        'Ketik di terminal: pip install <nama-modul> (contoh: pip install discord.py)',
        'Jika ada file requirements.txt: pip install -r requirements.txt',
        'Restart server untuk memuat modul baru.'
      ],
      quickCmd: 'pip install -r requirements.txt'
    },
    {
      title: 'Solusi: Discord Bot "Disallowed Intents"',
      badge: 'Discord',
      color: 'border-indigo-800 bg-indigo-950/20 text-indigo-300',
      desc: 'Bot Discord crash saat login karena butuh izin Privileged Intents.',
      steps: [
        'Buka https://discord.com/developers/applications',
        'Klik nama Bot Anda lalu pilih tab "Bot" di menu kiri.',
        'Scroll ke bawah ke "Privileged Gateway Intents".',
        'Aktifkan (centang) "Message Content Intent" & "Server Members Intent".',
        'Klik tombol "Save Changes" di Discord, lalu Start kembali bot Anda di panel.'
      ]
    },
    {
      title: 'Solusi: "npm ERR! missing script: start"',
      badge: 'Startup',
      color: 'border-blue-800 bg-blue-950/20 text-blue-300',
      desc: 'Perintah npm start gagal karena file package.json tidak memiliki script start.',
      steps: [
        'Buka tab Settings di panel server.',
        'Ubah Startup Command menjadi: node index.js atau node bot.js',
        'Atau buka File Manager -> edit package.json dan tambahkan "scripts": { "start": "node index.js" }.',
        'Simpan dan klik Start.'
      ],
      quickCmd: 'node index.js'
    }
  ];

  const hasActiveIssue = detectedIssue && detectedIssue.id !== dismissedIssueId && !botInputPrompt;

  return (
    <div className={`relative flex flex-col h-[580px] ${activeTheme.bgClass} ${activeTheme.textClass} border ${activeTheme.borderClass} rounded-2xl overflow-hidden shadow-2xl transition-colors duration-200`}>
      {/* Terminal Top Bar */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${activeTheme.headerBgClass} border-b ${activeTheme.borderClass} text-xs shrink-0 select-none`}>
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`}></div>
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-700"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-700"></div>
          </div>
          <span className="font-mono text-neutral-300 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">container:console/tty</span>
          </span>
          <span className="text-neutral-600 hidden sm:inline">·</span>
          <span className="font-mono text-neutral-400 text-[11px]">{logs.length} baris</span>
          <span className="text-neutral-600 hidden sm:inline">·</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
            status === 'running' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60' : 'bg-neutral-800 text-neutral-400'
          }`}>
            {status === 'running' ? 'ONLINE (STDIN)' : 'OFFLINE (EXEC)'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Theme Selector */}
          <div className="relative">
            <button
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-700 rounded-lg transition-colors border border-neutral-700"
              title="Pilih Tema Console Terminal"
            >
              <Palette className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="font-mono text-[11px] hidden md:inline">{activeTheme.name}</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </button>

            {themeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 z-50">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                  Tema Console (Live)
                </div>
                {(Object.keys(CONSOLE_THEMES) as ConsoleThemeKey[]).map((tKey) => {
                  const themeItem = CONSOLE_THEMES[tKey];
                  const isSelected = tKey === themeKey;
                  return (
                    <button
                      key={tKey}
                      onClick={() => handleSelectTheme(tKey)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center justify-between transition-colors ${
                        isSelected ? 'bg-purple-950/60 text-purple-300 font-bold' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${themeItem.bgClass} border border-neutral-600`}></span>
                        {themeItem.name}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Font Size Selector */}
          <div className="flex items-center bg-neutral-800/80 border border-neutral-700 rounded-lg p-0.5">
            <button
              onClick={() => handleFontSizeChange(-1)}
              className="px-1.5 py-0.5 text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors font-mono font-bold"
              title="Kecilkan Font Console"
            >
              A-
            </button>
            <span className="px-1 text-[10px] font-mono text-neutral-300 tabular-nums">
              {fontSize}px
            </span>
            <button
              onClick={() => handleFontSizeChange(1)}
              className="px-1.5 py-0.5 text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors font-mono font-bold"
              title="Besarkan Font Console"
            >
              A+
            </button>
          </div>

          {/* Quick Troubleshooting / Diagnostics Button */}
          <button
            onClick={() => setShowTroubleshootModal(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all font-medium border ${
              hasActiveIssue
                ? 'bg-rose-500/15 border-rose-700 text-rose-300 hover:bg-rose-500/25 animate-pulse'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-700'
            }`}
            title="Diagnostik Error & Panduan Step-by-Step"
          >
            {hasActiveIssue ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Wrench className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            )}
            <span className="hidden sm:inline">{hasActiveIssue ? 'Solusi Error (1)' : 'Diagnostik'}</span>
          </button>

          {/* Quick command dropdown */}
          <div className="relative">
            <button
              onClick={() => setQuickCmdOpen(!quickCmdOpen)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors border border-neutral-700"
            >
              <span>Quick</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </button>

            {quickCmdOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 z-40">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                  Perintah Instan Container
                </div>
                {quickCommands.map((qc) => (
                  <button
                    key={qc.cmd}
                    onClick={() => {
                      handleExecuteQuick(qc.cmd);
                      setQuickCmdOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white font-mono flex items-center justify-between transition-colors"
                  >
                    <span>{qc.label}</span>
                    <Play className="w-3 h-3 text-neutral-500 opacity-60" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-Scroll Toggle */}
          <button
            onClick={handleToggleAutoScroll}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors border ${
              autoScroll 
                ? 'bg-neutral-800 border-neutral-700 text-white' 
                : 'bg-transparent border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
            title={autoScroll ? "Auto-scroll Aktif (Klik untuk jeda)" : "Auto-scroll Nonaktif (Klik untuk aktifkan)"}
          >
            <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span className="text-[11px] font-mono hidden sm:inline">{autoScroll ? 'Auto' : 'Pause'}</span>
          </button>

          {/* Clear console */}
          <button
            onClick={onClear}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            title="Bersihkan log terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div 
        ref={viewportRef}
        onScroll={handleScroll}
        style={{ fontSize: `${fontSize}px` }}
        className={`flex-1 p-4 font-mono overflow-y-auto leading-relaxed select-text space-y-0.5 ${activeTheme.bgClass} ${activeTheme.textClass} scroll-smooth`}
      >
        {logs.length === 0 ? (
          <div className="text-neutral-500 italic py-16 text-center font-mono">
            [Aether Console] Terminal terhubung ({activeTheme.name}). Menunggu log dari container...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap break-all opacity-95">
              {renderAnsiText(log)}
            </div>
          ))
        )}
      </div>

      {/* Floating Smart Scroll-to-Bottom Button (appears when user scrolled up) */}
      {userScrolledUp && (
        <div className="absolute bottom-16 right-6 z-20">
          <button
            onClick={() => scrollToBottom(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-mono rounded-full border border-neutral-600 shadow-xl transition-all hover:scale-105 animate-bounce"
          >
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Scroll ke bawah</span>
            {unreadLogsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-500 text-black text-[10px] font-bold rounded-full">
                +{unreadLogsCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Inline Intelligent Error Banner (when an error is detected in logs) */}
      {hasActiveIssue && (
        <div className="px-4 py-2.5 bg-rose-950/60 border-t border-b border-rose-900/70 text-xs shrink-0 transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-rose-200">{detectedIssue.title}</span>
                  {detectedIssue.fileLocation && (
                    <span className="px-1.5 py-0.5 bg-rose-900/60 border border-rose-800 text-rose-300 text-[10px] font-mono rounded">
                      Lokasi: {detectedIssue.fileLocation}
                    </span>
                  )}
                </div>
                <p className="text-neutral-300 text-xs mt-0.5 line-clamp-2">
                  {detectedIssue.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {detectedIssue.recommendedCommand && (
                <button
                  onClick={() => handleExecuteQuick(detectedIssue.recommendedCommand!)}
                  disabled={executingCmd !== null}
                  className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-xs rounded-lg flex items-center gap-1 shadow-sm transition-all"
                  title="Jalankan perintah perbaikan otomatis"
                >
                  {executingCmd === detectedIssue.recommendedCommand ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 fill-black" />
                  )}
                  <span>{detectedIssue.commandActionLabel || 'Jalankan Solusi'}</span>
                </button>
              )}

              <button
                onClick={() => setShowTroubleshootModal(true)}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg border border-neutral-700 transition-colors"
                title="Lihat petunjuk langkah demi langkah"
              >
                Detail
              </button>

              <button
                onClick={() => setDismissedIssueId(detectedIssue.id)}
                className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                title="Sembunyikan peringatan"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Bot Input Helper (e.g. WhatsApp Pairing Number) */}
      {botInputPrompt && (
        <div className="px-4 py-2.5 bg-emerald-950/90 border-t border-b border-emerald-600/70 text-xs shrink-0 transition-all flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0">
              <span className="text-emerald-400 font-bold text-xs">WA</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-emerald-300">{botInputPrompt.title}</div>
              <p className="text-neutral-300 text-[11px] mt-0.5 line-clamp-1">
                {botInputPrompt.description}
              </p>
            </div>
          </div>
          <div className="text-[11px] font-mono text-emerald-300 shrink-0 bg-emerald-900/60 px-2.5 py-1 rounded-md border border-emerald-700/60 font-semibold hidden sm:block">
            Ketik nomor & Tekan Enter ↵
          </div>
        </div>
      )}

      {/* Terminal STDIN / EXEC Input Bar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2.5 bg-neutral-900 border-t border-neutral-800 shrink-0">
        <span className="text-neutral-500 font-mono text-sm pl-2 select-none">{'>'}</span>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            botInputPrompt
              ? botInputPrompt.placeholder
              : status === 'running' 
                ? "Ketik perintah console (contoh: npm test, reload, help)..." 
                : "Server offline - Ketik perintah (contoh: npm install discord.js, ls, node -v)..."
          }
          className={`flex-1 bg-transparent border-0 font-mono text-xs focus:outline-none ${
            botInputPrompt 
              ? "text-emerald-300 placeholder:text-emerald-500/80 font-semibold" 
              : "text-white placeholder:text-neutral-600"
          }`}
        />
        <button
          type="submit"
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 shadow-sm ${
            inputVal.trim()
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
              : 'bg-white hover:bg-neutral-200 text-black'
          }`}
        >
          <span>Kirim</span>
          <Send className="w-3 h-3" />
        </button>
      </form>

      {/* MODAL: DIAGNOSTIK ERROR & PANDUAN STEP-BY-STEP */}
      {showTroubleshootModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Diagnostik & Troubleshooting Server</h3>
                  <p className="text-xs text-neutral-400">Analisis otomatis masalah log dan panduan instalasi step-by-step</p>
                </div>
              </div>
              <button
                onClick={() => setShowTroubleshootModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-neutral-800 bg-neutral-950/50">
              <button
                onClick={() => setActiveTroubleshootTab('scan')}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTroubleshootTab === 'scan'
                    ? 'border-white text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hasil Analisis Log {detectedIssue && '(Error Terdeteksi)'}</span>
              </button>
              <button
                onClick={() => setActiveTroubleshootTab('guides')}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTroubleshootTab === 'guides'
                    ? 'border-white text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Panduan Instalasi & Error Populer</span>
              </button>
              <button
                onClick={() => setActiveTroubleshootTab('tools')}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTroubleshootTab === 'tools'
                    ? 'border-white text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Perintah Cepat Container</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {activeTroubleshootTab === 'scan' && (
                <div>
                  {detectedIssue ? (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-rose-900/60 space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-rose-300">{detectedIssue.title}</h4>
                            <span className="px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-mono rounded">
                              Tingkat: Kritis
                            </span>
                          </div>
                          <p className="text-xs text-neutral-300 mt-1">{detectedIssue.description}</p>
                        </div>
                      </div>

                      {/* Mengapa ini terjadi */}
                      <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800 text-xs">
                        <span className="font-semibold text-neutral-200">Penyebab Masalah:</span>
                        <p className="text-neutral-400 mt-0.5">{detectedIssue.cause}</p>
                        {detectedIssue.fileLocation && (
                          <div className="mt-1 font-mono text-[11px] text-amber-300">
                            Lokasi Berkas: {detectedIssue.fileLocation}
                          </div>
                        )}
                      </div>

                      {/* Langkah-langkah Perbaikan Step-by-Step */}
                      <div>
                        <h5 className="text-xs font-semibold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Langkah-langkah Perbaikan (Step-by-Step):</span>
                        </h5>
                        <div className="space-y-2">
                          {detectedIssue.steps.map((st, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-2 bg-neutral-900/60 rounded-lg text-xs">
                              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span className="text-neutral-300 font-sans leading-relaxed">{st}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Command Box */}
                      {detectedIssue.recommendedCommand && (
                        <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-center justify-between gap-3">
                          <div className="font-mono text-xs text-emerald-300 truncate">
                            $ {detectedIssue.recommendedCommand}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => copyToClipboard(detectedIssue.recommendedCommand!)}
                              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg flex items-center gap-1 transition-colors"
                            >
                              {copiedText === detectedIssue.recommendedCommand ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedText === detectedIssue.recommendedCommand ? 'Tersalin' : 'Salin'}</span>
                            </button>
                            <button
                              onClick={() => {
                                handleExecuteQuick(detectedIssue.recommendedCommand!);
                                setShowTroubleshootModal(false);
                              }}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md"
                            >
                              <Play className="w-3 h-3 fill-black" />
                              <span>Jalankan Sekarang</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-semibold text-white">Tidak Ada Kesalahan Kritis Terdeteksi</h4>
                      <p className="text-xs text-neutral-400 max-w-md mx-auto">
                        Sistem tidak mendeteksi crash atau missing dependency pada log terminal saat ini. Jika server belum menyala, klik tombol Start atau periksa panduan umum di tab sebelah.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTroubleshootTab === 'guides' && (
                <div className="space-y-4">
                  {guides.map((g, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-white">{g.title}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${g.color}`}>
                          {g.badge}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">{g.desc}</p>
                      
                      <div className="space-y-1.5 pt-1">
                        {g.steps.map((st, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="w-4 h-4 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-neutral-300">{st}</span>
                          </div>
                        ))}
                      </div>

                      {g.quickCmd && (
                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-neutral-800/80">
                          <code className="text-[11px] font-mono text-neutral-300 bg-neutral-900 px-2 py-1 rounded">
                            {g.quickCmd}
                          </code>
                          <button
                            onClick={() => {
                              handleExecuteQuick(g.quickCmd!);
                              setShowTroubleshootModal(false);
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-neutral-200 text-black text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <Play className="w-2.5 h-2.5 fill-black" />
                            <span>Jalankan</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTroubleshootTab === 'tools' && (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    Perintah diagnosis siap pakai. Klik "Jalankan" untuk mengeksekusi langsung di direktori container:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { name: 'Install Semua Paket (npm install)', cmd: 'npm install', desc: 'Mengunduh seluruh dependensi dari package.json' },
                      { name: 'Cek Versi Node & Python', cmd: 'node -v && python --version', desc: 'Memastikan compiler & runtime terpasang' },
                      { name: 'Daftar File (ls -la)', cmd: 'ls -la', desc: 'Melihat semua berkas dan hak akses di folder utama' },
                      { name: 'Lihat Isi package.json', cmd: 'cat package.json', desc: 'Memeriksa main file, dependencies, dan scripts' },
                      { name: 'Inisialisasi Proyek Baru', cmd: 'npm init -y', desc: 'Membuat berkas package.json default jika belum ada' },
                      { name: 'Cek Penggunaan Disk (df -h)', cmd: 'df -h', desc: 'Mengecek sisa kuota penyimpanan NVMe' }
                    ].map((tool, idx) => (
                      <div key={idx} className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="text-xs font-semibold text-white">{tool.name}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">{tool.desc}</div>
                          <code className="block text-[10px] font-mono text-emerald-400 bg-neutral-900 px-2 py-1 rounded mt-2 truncate">
                            $ {tool.cmd}
                          </code>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => {
                              handleExecuteQuick(tool.cmd);
                              setShowTroubleshootModal(false);
                            }}
                            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <Play className="w-2.5 h-2.5" />
                            <span>Jalankan</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
              <span>Aether Diagnostics Engine v2.4</span>
              <button
                onClick={() => setShowTroubleshootModal(false)}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
