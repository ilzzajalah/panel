export interface DiagnosticIssue {
  id: string;
  type: 'missing_module' | 'missing_python_module' | 'syntax_error' | 'entry_missing' | 'port_in_use' | 'discord_intent' | 'discord_token' | 'eula_error' | 'npm_start_missing' | 'general_error';
  severity: 'critical' | 'warning';
  title: string;
  description: string;
  fileLocation?: string;
  cause: string;
  steps: string[];
  recommendedCommand?: string;
  commandActionLabel?: string;
}

export function analyzeConsoleLogs(logs: string[], serverStatus?: string): DiagnosticIssue | null {
  if (!logs || logs.length === 0) return null;

  // Clean ANSI codes
  const plainLogs = logs.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));

  // Find the index of the latest process boot/start marker
  let startIdx = 0;
  for (let i = plainLogs.length - 1; i >= 0; i--) {
    const line = plainLogs[i];
    if (
      line.includes('Container booted successfully') ||
      line.includes('Memulai proses restart server') ||
      line.includes('Memulai ulang server') ||
      line.includes('Menyalakan server') ||
      line.includes('Container process exited with code') ||
      line.includes('> denia@') ||
      (line.startsWith('>') && line.includes(' start'))
    ) {
      startIdx = i;
      break;
    }
  }

  // Focus analysis strictly on the active/current run
  const activeSlice = startIdx > 0 ? plainLogs.slice(startIdx) : plainLogs.slice(-60);
  const cleanLogs = activeSlice.join('\n');

  // Check if any port error was ALREADY resolved or if bot is running healthy
  const lastPortErr = Math.max(cleanLogs.lastIndexOf('EADDRINUSE'), cleanLogs.lastIndexOf('address already in use'));
  const isPortResolved = lastPortErr === -1 || (
    cleanLogs.slice(lastPortErr).includes('berhasil dibebaskan') ||
    cleanLogs.slice(lastPortErr).includes('bebas! Merestart server') ||
    cleanLogs.slice(lastPortErr).includes('Port Free') ||
    cleanLogs.slice(lastPortErr).includes('Container booted successfully') ||
    cleanLogs.slice(lastPortErr).includes('Masukkan nomor WhatsApp') ||
    cleanLogs.slice(lastPortErr).includes('WhatsApp Bot') ||
    cleanLogs.slice(lastPortErr).includes('running on port') ||
    cleanLogs.slice(lastPortErr).includes('initialized successfully') ||
    (serverStatus === 'running' && !cleanLogs.includes('Error: listen EADDRINUSE'))
  );

  // 1. Missing Node.js module (MODULE_NOT_FOUND or Cannot find module)
  const nodeModuleMatch = cleanLogs.match(/Error:\s*Cannot find module\s*['"]([^'"]+)['"]/i) || 
                          cleanLogs.match(/Cannot find module\s*['"]([^'"]+)['"]/i);
  if (nodeModuleMatch) {
    const rawModule = nodeModuleMatch[1];

    if (rawModule.startsWith('.') || rawModule.startsWith('/')) {
      return {
        id: 'missing-local-file',
        type: 'entry_missing',
        severity: 'critical',
        title: `Berkas Lokal "${rawModule}" Tidak Ditemukan`,
        description: `Node.js tidak dapat menemukan berkas script di jalur "${rawModule}".`,
        fileLocation: rawModule,
        cause: `Script Anda memanggil require("${rawModule}") atau import, tetapi berkas tersebut belum dibuat atau namanya salah ketik (case-sensitive di Linux).`,
        steps: [
          'Buka tab File Manager di panel server.',
          `Pastikan berkas "${rawModule}.js" atau "${rawModule}.ts" sudah diunggah di folder yang tepat.`,
          'Periksa kembali penulisan huruf besar dan kecil pada nama berkas.',
          'Setelah berkas tersedia, klik tombol Start / Restart.'
        ],
        commandActionLabel: 'Cek Daftar File',
        recommendedCommand: 'ls -la'
      };
    } else {
      // It's an npm package (e.g. discord.js, express, dotenv, etc.)
      const packageName = rawModule.startsWith('@') 
        ? rawModule.split('/').slice(0, 2).join('/') 
        : rawModule.split('/')[0];

      return {
        id: `missing-npm-${packageName}`,
        type: 'missing_module',
        severity: 'critical',
        title: `Package "${packageName}" Belum Terinstall`,
        description: `Aplikasi Anda membutuhkan pustaka npm "${packageName}" yang belum terpasang di folder server.`,
        cause: `Script memanggil library "${packageName}", tetapi direktori node_modules belum memiliki paket ini.`,
        steps: [
          `Klik tombol "Install ${packageName}" di bawah ini atau jalankan: npm install ${packageName} --save`,
          `Jika bot Anda memiliki berkas package.json lengkap, Anda juga dapat menjalankan: npm install`,
          `Tunggu hingga terminal menampilkan status selesai (exit code 0).`,
          `Klik tombol Start di pojok kanan atas untuk menyalakan bot/server kembali.`
        ],
        recommendedCommand: `npm install ${packageName}`,
        commandActionLabel: `⚡ Install "${packageName}" Otomatis`
      };
    }
  }

  // 2. Missing Python Module
  const pyModuleMatch = cleanLogs.match(/ModuleNotFoundError:\s*No module named\s*['"]([^'"]+)['"]/i) ||
                        cleanLogs.match(/ImportError:\s*No module named\s*['"]([^'"]+)['"]/i);
  if (pyModuleMatch) {
    const rawMod = pyModuleMatch[1];
    let pipPkg = rawMod;
    if (rawMod === 'discord') pipPkg = 'discord.py';
    else if (rawMod === 'cv2') pipPkg = 'opencv-python';
    else if (rawMod === 'PIL') pipPkg = 'pillow';
    else if (rawMod === 'bs4') pipPkg = 'beautifulsoup4';

    return {
      id: `missing-py-${pipPkg}`,
      type: 'missing_python_module',
      severity: 'critical',
      title: `Modul Python "${rawMod}" Belum Terinstall`,
      description: `Python tidak dapat menemukan library "${rawMod}" yang diimpor oleh script Anda.`,
      cause: `Pustaka "${rawMod}" belum diunduh ke environment Python server Anda.`,
      steps: [
        `Jalankan perintah instalasi berikut di terminal: pip install ${pipPkg}`,
        `Jika proyek Anda memiliki berkas requirements.txt, jalankan: pip install -r requirements.txt`,
        `Setelah proses unduh dependensi selesai, klik tombol Start / Restart server.`
      ],
      recommendedCommand: `pip install ${pipPkg}`,
      commandActionLabel: `⚡ Install pip ${pipPkg}`
    };
  }

  // 3. Port Conflict (EADDRINUSE) - ONLY IF ACTIVE AND NOT RESOLVED
  if (!isPortResolved && (cleanLogs.includes('EADDRINUSE') || /address already in use/i.test(cleanLogs))) {
    const portMatch = cleanLogs.match(/:::(\d+)/) || cleanLogs.match(/port\s*(\d+)/i) || cleanLogs.match(/:\s*(\d{4,5})/);
    const portStr = portMatch ? portMatch[1] : 'yang ditentukan';
    return {
      id: 'port-eaddrinuse',
      type: 'port_in_use',
      severity: 'critical',
      title: `Port ${portStr} Sedang Bentrok (EADDRINUSE)`,
      description: `Port jaringan ${portStr} sedang digunakan oleh proses lain atau proses server sebelumnya belum mati sempurna.`,
      cause: `Aplikasi Anda mencoba membuka port ${portStr}, tetapi sistem operasi mendeteksi port tersebut masih terkunci oleh proses latar belakang.`,
      steps: [
        'Klik tombol "Bebaskan Port & Selesaikan" di bawah ini.',
        'Sistem akan membasmi proses zombie pada port tersebut dan menyalakan kembali server.',
        'Jika port digunakan layanan eksternal OS, sistem akan merelokasi port secara dinamis tanpa crash.'
      ],
      recommendedCommand: 'free-port',
      commandActionLabel: `⚡ Bebaskan Port ${portStr} & Selesaikan`
    };
  }

  // 4. Missing Start Script in package.json
  if (cleanLogs.includes('npm ERR! missing script: start') || cleanLogs.includes('npm error missing script: start')) {
    return {
      id: 'missing-npm-start',
      type: 'npm_start_missing',
      severity: 'critical',
      title: `Script "start" Tidak Ditemukan di package.json`,
      description: `Perintah "npm start" gagal dijalankan karena berkas package.json tidak memiliki bagian "start" di dalam block "scripts".`,
      cause: `Server AetherPanel menjalankan "npm start" secara default, namun berkas package.json Anda belum mendefinisikan script startup.`,
      steps: [
        'Solusi 1 (Paling Mudah): Buka tab Settings, ubah "Perintah Startup" menjadi "node index.js" atau "node bot.js", lalu simpan.',
        'Solusi 2: Buka File Manager -> klik package.json, tambahkan baris berikut di dalam "scripts": "start": "node index.js"',
        'Setelah itu, klik tombol Start untuk menjalankan kembali.'
      ],
      commandActionLabel: 'Jalankan node index.js langsung',
      recommendedCommand: 'node index.js'
    };
  }

  // ES Module require() Conflict
  if (/require is not defined in ES module scope/i.test(cleanLogs) || /ReferenceError:\s*require is not defined/i.test(cleanLogs)) {
    return {
      id: 'esm-require-conflict',
      type: 'syntax_error',
      severity: 'critical',
      title: `Konflik ES Module & CommonJS (require() vs type: "module")`,
      description: `Script Anda menggunakan sintaks require(), tetapi berkas package.json berisi "type": "module".`,
      cause: `Node.js mewajibkan penggunaan sintaks "import" jika package.json diset sebagai ES Module ("type": "module"). Panggilan require() menyebabkan ReferenceError.`,
      steps: [
        'Solusi 1 (Otomatis): Klik tombol "Hapus type: module" di bawah ini untuk mengizinkan sintaks require().',
        'Solusi 2 (Manual): Buka File Manager -> edit package.json, hapus baris "type": "module".',
        'Solusi 3: Atau ganti sintaks pada script Anda dari const x = require("x") menjadi import x from "x".',
        'Setelah itu, klik tombol Start / Restart di pojok kanan atas.'
      ],
      commandActionLabel: '⚡ Hapus "type": "module" dari package.json',
      recommendedCommand: 'node -e "const fs=require(\'fs\'); if(fs.existsSync(\'package.json\')){let p=JSON.parse(fs.readFileSync(\'package.json\')); delete p.type; fs.writeFileSync(\'package.json\', JSON.stringify(p, null, 2)); console.log(\'✅ type:module berhasil dihapus dari package.json\');}"'
    };
  }

  // 5. Discord Disallowed Intents
  if (/disallowed intents/i.test(cleanLogs) || /used disallowed intents/i.test(cleanLogs)) {
    return {
      id: 'discord-disallowed-intents',
      type: 'discord_intent',
      severity: 'critical',
      title: `Privileged Intents Discord Belum Diaktifkan`,
      description: `Bot Discord Anda ditolak oleh gateway Discord karena menggunakan intents khusus (seperti Message Content / Guild Members) yang belum dicentang di portal Discord.`,
      cause: `Discord mengharuskan verifikasi izin Privileged Gateway Intents untuk membaca isi pesan dan daftar member server.`,
      steps: [
        'Buka browser dan kunjungi: https://discord.com/developers/applications',
        'Pilih nama Bot Anda di daftar aplikasi.',
        'Buka menu "Bot" di bilah menu kiri.',
        'Scroll ke bawah ke bagian "Privileged Gateway Intents", lalu AKTIFKAN centang:',
        '  - Presence Intent',
        '  - Server Members Intent',
        '  - Message Content Intent',
        'Klik tombol hijau "Save Changes" di bagian bawah layar Discord.',
        'Kembali ke AetherPanel dan klik tombol Start / Restart.'
      ]
    };
  }

  // 6. Discord Invalid Token
  if (/An invalid token was provided/i.test(cleanLogs) || /TOKEN_INVALID/i.test(cleanLogs)) {
    return {
      id: 'discord-invalid-token',
      type: 'discord_token',
      severity: 'critical',
      title: `Token Discord Bot Tidak Valid`,
      description: `Discord menolak koneksi karena token bot salah, kedaluwarsa, atau telah di-reset.`,
      cause: `Token pada berkas .env atau config.json tidak cocok dengan token bot Anda saat ini di Discord Developer Portal.`,
      steps: [
        'Buka https://discord.com/developers/applications -> Pilih Bot Anda -> Menu "Bot".',
        'Klik tombol "Reset Token" untuk menyalin token baru.',
        'Buka tab File Manager di AetherPanel -> Buka berkas ".env" atau "config.json".',
        'Perbarui DISCORD_TOKEN dengan token yang baru Anda salin.',
        'Simpan berkas dan klik Start / Restart.'
      ]
    };
  }

  // 7. Syntax Error
  const syntaxMatch = cleanLogs.match(/SyntaxError:\s*([^\r\n]+)/i);
  if (syntaxMatch) {
    const errorDetail = syntaxMatch[1];
    const fileMatch = cleanLogs.match(/([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|json|py)):(\d+)(?::(\d+))?/);
    const loc = fileMatch ? `${fileMatch[1]}:${fileMatch[2]}` : undefined;

    const fileName = fileMatch ? fileMatch[1] : null;
    const lineNum = fileMatch ? fileMatch[2] : null;

    return {
      id: 'syntax-error',
      type: 'syntax_error',
      severity: 'critical',
      title: `Kesalahan Sintaks Kode (SyntaxError)`,
      description: `Ditemukan kesalahan penulisan kode: ${errorDetail}`,
      fileLocation: loc,
      cause: loc ? `Terdapat typo, tanda kurung tidak lengkap, atau kesalahan karakter di berkas ${loc}.` : 'Terdapat kesalahan sintaks pada kode yang dijalankan.',
      steps: [
        fileName ? `Buka tab File Manager dan cari berkas "${fileName}".` : 'Buka tab File Manager dan buka file utama Anda.',
        lineNum ? `Cek baris ke-${lineNum}, perbaiki tanda kurung atau koma yang keliru.` : 'Periksa baris yang disebutkan pada pesan error di console.',
        'Simpan berkas setelah diperbaiki.',
        'Klik tombol Start / Restart.'
      ]
    };
  }

  // 8. Minecraft EULA
  if (/You need to agree to the EULA/i.test(cleanLogs)) {
    return {
      id: 'minecraft-eula',
      type: 'eula_error',
      severity: 'critical',
      title: `Persetujuan EULA Minecraft Diperlukan`,
      description: `Server Minecraft Paper/Spigot tidak dapat menyala sebelum Anda menyetujui EULA Mojang.`,
      cause: `Berkas eula.txt masih bernilai eula=false.`,
      steps: [
        'Buka tab File Manager.',
        'Buka berkas "eula.txt".',
        'Ubah "eula=false" menjadi "eula=true".',
        'Simpan berkas dan klik Start.'
      ],
      recommendedCommand: 'echo "eula=true" > eula.txt',
      commandActionLabel: '⚡ Setujui EULA Otomatis'
    };
  }

  // 9. Entry file missing (e.g. index.js / main.py not found)
  if (/ENOENT.*open.*package\.json/i.test(cleanLogs) && cleanLogs.includes('npm start')) {
    return {
      id: 'no-package-json',
      type: 'entry_missing',
      severity: 'warning',
      title: `Berkas package.json Tidak Ditemukan`,
      description: `Perintah "npm start" membutuhkan berkas package.json yang saat ini belum ada di folder server.`,
      cause: `Folder server masih kosong atau bot Anda berupa single-file (seperti bot.js).`,
      steps: [
        'Jika ingin menggunakan package.json, jalankan perintah: npm init -y',
        'Atau buka tab Settings dan ganti Perintah Startup menjadi: node bot.js (sesuai nama file Anda)',
        'Klik Simpan Pengaturan dan nyalakan server.'
      ],
      recommendedCommand: 'npm init -y',
      commandActionLabel: '⚡ Buat package.json (npm init -y)'
    };
  }

  return null;
}
