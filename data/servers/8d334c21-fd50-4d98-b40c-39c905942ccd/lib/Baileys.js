// Lapisan kompatibilitas: bot ini dulu memakai fork "@sairidev/baileys-new" (sudah dicabut dari npm).
// Semua import Baileys sekarang lewat berkas ini, memakai @whiskeysockets/baileys.
// Simbol yang cuma ada di fork diberi pengganti aman.
import * as B from '@whiskeysockets/baileys'

export * from '@whiskeysockets/baileys'

const rawMakeWASocket = B.makeWASocket ?? B.default?.makeWASocket ?? B.default

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Pairing code tidak boleh diminta sebelum WebSocket terbuka dan handshake selesai.
// Pembungkus ini menunggu sampai siap (event `qr`/`open`), lalu mencoba ulang kalau masih "Connection Closed" (428).
export const makeWASocket = (...args) => {
   const sock = rawMakeWASocket(...args)

   let ready = false
   sock.ev.on('connection.update', (update) => {
      if (update.qr || update.connection === 'open') ready = true
   })

   const originalRequest = sock.requestPairingCode?.bind(sock)
   if (originalRequest)
      sock.requestPairingCode = async (...params) => {
         const startedAt = Date.now()
         while ((!ready || sock.ws?.isOpen === false) && Date.now() - startedAt < 40000)
            await sleep(200)

         for (let attempt = 1; ; attempt++) {
            try {
               return await originalRequest(...params)
            }
            catch (error) {
               const closed = error?.output?.statusCode === 428 || /Connection Closed/i.test(error?.message || '')
               if (!closed || attempt >= 5) throw error
               await sleep(1500)
            }
         }
      }

   return sock
}

const jidEnds = (suffix) => (jid) => typeof jid === 'string' && jid.endsWith(suffix)

export const isPnUser = B.isPnUser ?? jidEnds('@s.whatsapp.net')
export const isLidUser = B.isLidUser ?? jidEnds('@lid')
export const isJidGroup = B.isJidGroup ?? jidEnds('@g.us')
export const isJidNewsletter = B.isJidNewsletter ?? jidEnds('@newsletter')
export const jidNormalizedUser = B.jidNormalizedUser ?? ((jid = '') => jid.replace(/:\d+@/, '@'))
export const areJidsSameUser = B.areJidsSameUser ?? ((a, b) => jidNormalizedUser(a) === jidNormalizedUser(b))
export const S_WHATSAPP_NET = B.S_WHATSAPP_NET ?? '@s.whatsapp.net'
export const WA_DEFAULT_EPHEMERAL = B.WA_DEFAULT_EPHEMERAL ?? 7 * 24 * 60 * 60

// Hanya ada di fork lama. Ganti URL lewat env DONATE_URL kalau mau.
export const DONATE_URL = process.env.DONATE_URL || B.DONATE_URL || 'https://whatsapp.com'
export const tokenizeCode = B.tokenizeCode
// true kalau library mendukung pesan `richResponse` (fitur fork lama)
export const RICH_SUPPORTED = typeof B.tokenizeCode === 'function'
