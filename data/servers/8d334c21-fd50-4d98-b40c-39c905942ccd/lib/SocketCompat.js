// Penambal method socket yang dulu hanya ada di fork "@sairidev/baileys-new".
// Dipasang di Listener.bind(), sebelum event pertama masuk. Method yang sudah ada tidak ditimpa.
import { jidNormalizedUser } from './Baileys.js'


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Antrean sederhana: batas paralel + jeda minimum antar-permintaan + prioritas + blokir sementara saat kena rate limit.
const createLimiter = ({ concurrency = 2, interval = 600 } = {}) => {
   const queue = []
   let active = 0, last = 0, blockedUntil = 0, timer = null, seq = 0

   const pump = () => {
      if (timer) return
      while (queue.length && active < concurrency) {
         const now = Date.now()
         const wait = Math.max(blockedUntil - now, last + interval - now)
         if (wait > 0) {
            timer = setTimeout(() => { timer = null; pump() }, wait)
            return
         }
         queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
         const job = queue.shift()
         active++
         last = Date.now()
         job.run().then(job.resolve, job.reject).finally(() => { active--; pump() })
      }
   }

   return {
      add: (run, priority = 0) => new Promise((resolve, reject) => {
         queue.push({ run, priority, seq: ++seq, resolve, reject })
         pump()
      }),
      block: (ms) => { blockedUntil = Math.max(blockedUntil, Date.now() + ms) }
   }
}

const isRateLimit = (error) =>
   error?.message === 'rate-overlimit' || error?.data === 429 || error?.output?.statusCode === 429

const GROUP_TTL = 10 * 60 * 1000       // cache dianggap segar
const GROUP_MIN_REFRESH = 30 * 1000    // refresh paksa diabaikan kalau data baru diambil < 30 detik lalu
const GROUP_MAX_ATTEMPT = 4

// sock.groupMetadata(jid, { force, priority }):
//  - pakai cache selama masih segar, gabungkan permintaan kembar, batasi kecepatan, ulangi saat 429,
//  - kalau tetap gagal tapi ada data lama, kembalikan data lama.
export const limitGroupMetadata = (sock, options) => {
   const original = sock.groupMetadata?.bind(sock)
   if (!original || sock.groupMetadata.__limited) return sock

   const limiter = createLimiter(options)
   const cache = new Map()
   const inflight = new Map()

   const fetchOnce = async (jid, priority) => {
      for (let attempt = 1; ; attempt++) {
         try {
            const data = await limiter.add(() => original(jid), priority)
            cache.set(jid, { at: Date.now(), data })
            return data
         }
         catch (error) {
            if (!isRateLimit(error) || attempt >= GROUP_MAX_ATTEMPT) throw error
            limiter.block(attempt * 5000)
         }
      }
   }

   const groupMetadata = (jid, { force = false, priority = 10 } = {}) => {
      const hit = cache.get(jid)
      const age = hit ? Date.now() - hit.at : Infinity

      if (hit && (force ? age < GROUP_MIN_REFRESH : age < GROUP_TTL))
         return Promise.resolve(hit.data)

      let promise = inflight.get(jid)
      if (!promise) {
         promise = fetchOnce(jid, force ? 0 : priority)
            .catch((error) => {
               if (hit) return hit.data
               throw error
            })
            .finally(() => inflight.delete(jid))
         inflight.set(jid, promise)
      }
      return promise
   }
   groupMetadata.__limited = true

   sock.groupMetadata = groupMetadata
   return sock
}

export const PatchSocket = (sock, getSetting = () => ({})) => {
   limitGroupMetadata(sock)

   // LID -> nomor telepon. Kalau tidak bisa di-resolve, phoneNumber diawali "id:" (sesuai cek startsWith('id') di Listener).
   if (typeof sock.findUserId !== 'function')
      sock.findUserId = async (jid) => {
         if (typeof jid !== 'string')
            return { id: jid, phoneNumber: 'id:' + jid }

         if (!jid.endsWith('@lid'))
            return { id: jid, phoneNumber: jidNormalizedUser(jid) }

         try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid)
            if (pn) return { id: jid, phoneNumber: jidNormalizedUser(pn) }
         }
         catch { }

         return { id: jid, phoneNumber: 'id:' + jid }
      }

   if (typeof sock.updateMemberLabel !== 'function')
      sock.updateMemberLabel = async () => {
         throw new Error('Member label is not supported by the installed Baileys version.')
      }

   // Daftar newsletter yang diikuti. Versi pengganti hanya mengembalikan newsletter yang diset di setting (setchid).
   if (typeof sock.newsletterSubscribed !== 'function')
      sock.newsletterSubscribed = async () => {
         const id = getSetting()?.newsletterId
         if (!id) return []
         try {
            const meta = await sock.newsletterMetadata('jid', id)
            if (!meta) return []
            return [{
               ...meta,
               id: meta.id ?? id,
               viewer_metadata: meta.viewer_metadata ?? { role: meta.role ?? 'SUBSCRIBER' }
            }]
         }
         catch {
            return []
         }
      }

   return sock
}
