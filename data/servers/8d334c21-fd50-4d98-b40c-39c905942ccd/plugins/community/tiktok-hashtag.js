const required = ['#hashirafamily', '#margahsi']
const tiktokUrl = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i
export default {
  async run(m, { sock, group, isAdmin, isPartner, body }) {
    if (!m.isGroup || isAdmin || isPartner || !tiktokUrl.test(body || '')) return
    const normalized = (body || '').toLowerCase()
    const missing = required.filter(tag => !normalized.includes(tag))
    if (!missing.length) {
      try {
        await sock.sendMessage(m.chat, { text: '✅ Lolos hashtag detector! #hashirafamily dan #margahsi terdeteksi.', templateButtons: [
          { index: 1, urlButton: { displayText: 'Kunjungi Vt', url: (body.match(tiktokUrl) || [])[0] } },
          { index: 2, urlButton: { displayText: 'Lihat Profil', url: 'https://www.tiktok.com/' } }
        ] }, { quoted: m })
      } catch { await m.reply('✅ Lolos hashtag detector! Kedua hashtag wajib terdeteksi.') }
      return
    }
    try { await sock.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.id, participant: m.sender } }) } catch {}
    await m.reply(`⚠️ *Warning Hashtag TikTok*\nVideo dihapus karena hashtag wajib belum lengkap: ${missing.join(', ')}.\nGunakan #hashirafamily dan #margahsi pada setiap link video TikTok.`)
  },
  group: true,
  botAdmin: true
}
