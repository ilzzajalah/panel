// report.js — command .report <nomor> <jumlah>
// tags  : tools
// usage : .report 628xxxxxxxx 5

import { resolveSender } from './tetris.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handler = async (m, { conn, args }) => {

  // ── validasi argumen ─────────────────────────────────────────────────────
  const nomor  = args[0]?.replace(/[^0-9]/g, '')
  const jumlah = parseInt(args[1]) || 5

  if (!nomor) {
    return conn.sendMessage(m.chat, {
      text: '❌ Format salah.\nContoh: .report 628xxxxxxxx 5'
    }, { quoted: m })
  }

  if (jumlah < 1 || jumlah > 100) {
    return conn.sendMessage(m.chat, {
      text: '❌ Jumlah report harus antara 1–100.'
    }, { quoted: m })
  }

  const jid = nomor.includes('@s.whatsapp.net') ? nomor : `${nomor}@s.whatsapp.net`

  await conn.sendMessage(m.chat, {
    text: `🔧 Melaporkan *${nomor}* sebanyak *${jumlah}x*...`
  }, { quoted: m })

  // ── loop report ──────────────────────────────────────────────────────────
  let ok = 0
  for (let i = 0; i < jumlah; i++) {
    try {
      await conn.reportSpam(jid)
      ok++
    } catch (_) {}
    await sleep(500)
  }

  await conn.sendMessage(m.chat, {
    text: `✅ Selesai. ${ok}/${jumlah} report terkirim ke *${nomor}*.`
  }, { quoted: m })
}

handler.help    = ['report <nomor> <jumlah>']
handler.tags    = ['tools']
handler.command = /^report$/i

export default handler