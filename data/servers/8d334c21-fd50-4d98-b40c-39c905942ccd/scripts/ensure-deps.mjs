// Memastikan lapisan Baileys (lib/Baileys.js -> @whiskeysockets/baileys) bisa dimuat.
// Kalau gagal: hapus paket, install ulang sekali, cek lagi. Lewati dengan SKIP_DEP_CHECK=1
import { spawnSync } from 'child_process'
import { rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = '@whiskeysockets/baileys'
const log = (m) => console.log(`\x1b[36m[DEPS]\x1b[0m ${m}`)
const err = (m) => console.error(`\x1b[31m[DEPS]\x1b[0m ${m}`)

const run = (cmd, args, opts = {}) =>
   spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, shell: process.platform === 'win32', ...opts })

const pm = run('yarn', ['--version']).status === 0 ? 'yarn' : 'npm'

const canLoad = () => run(process.execPath, ['--input-type=module', '-e',
   `const m = await import('./lib/Baileys.js'); if (typeof m.makeWASocket !== 'function') process.exit(2)`]).status === 0

const install = () => run(pm, pm === 'yarn'
   ? ['install', '--force', '--non-interactive', '--network-timeout', '30000']
   : ['install', '--no-audit', '--no-fund'], { stdio: 'inherit' }).status === 0

const main = () => {
   if (process.env.SKIP_DEP_CHECK === '1') return 0
   if (!existsSync(join(ROOT, 'node_modules'))) {
      log('node_modules belum ada, menjalankan install...')
      install()
   }
   // ffmpeg dibutuhkan untuk audio/voice note/stiker: kalau tidak ada di sistem, pastikan paket binary-nya terpasang
   if (run('ffmpeg', ['-version']).status !== 0 && !existsSync(join(ROOT, 'node_modules', '@ffmpeg-installer', 'ffmpeg'))) {
      log('ffmpeg tidak ada di sistem, memasang @ffmpeg-installer/ffmpeg...')
      install()
   }

   if (canLoad()) return 0

   err(`${PKG} tidak bisa dimuat. Install ulang bersih...`)
   rmSync(join(ROOT, 'node_modules', ...PKG.split('/')), { recursive: true, force: true })
   install()
   if (canLoad()) { log('Berhasil setelah install ulang.'); return 0 }

   err(`Masih gagal. Cek koneksi internet server dan pastikan "${PKG}" ada di package.json.`)
   return 1
}

process.exit(main())
