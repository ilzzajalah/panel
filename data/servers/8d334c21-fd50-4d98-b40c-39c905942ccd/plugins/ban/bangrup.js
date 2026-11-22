// bangrup.js — command .bangrup (harus di dalam grup)
// tags  : group
// usage : .bangrup

import { resolveSender } from './tetris.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handler = async (m, { conn }) => {

  // ── validasi: harus di grup ──────────────────────────────────────────────
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, { text: '❌ Command ini hanya bisa dipakai di dalam grup.' }, { quoted: m })
  }

  const groupId   = m.chat
  const groupMeta = await conn.groupMetadata(groupId)
  const groupName = groupMeta.subject

  await conn.sendMessage(groupId, { text: `🔧 Memulai aksi pada grup: *${groupName}*` }, { quoted: m })

  // ── STEP 1: spam trigger (5x) ────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    await conn.sendMessage(groupId, { text: '⚠️⚠️⚠️⚠️⚠️' })
    await sleep(600)
  }

  // ── STEP 2: mass report (50x) ────────────────────────────────────────────
  let reported = 0
  for (let i = 0; i < 50; i++) {
    try {
      await conn.groupReportSpam(groupId)
      reported++
    } catch (_) {}
    await sleep(400)
  }

  await conn.sendMessage(groupId, { text: `✅ ${reported}/50 report terkirim.` })

  // ── STEP 3: keluar dari grup ─────────────────────────────────────────────
  await sleep(1500)
  await conn.groupLeave(groupId)
}

handler.help    = ['bangrup']
handler.tags    = ['group']
handler.command = /^bangrup$/i

export default handler