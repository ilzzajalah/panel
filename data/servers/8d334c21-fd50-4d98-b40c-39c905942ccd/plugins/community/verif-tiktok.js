const pending = new Map()
export default {
  command: ['vertiktok','veriftiktok','cekveriftiktok'],
  category: 'community',
  async run(m, { text, command, isAdmin, isPartner }) {
    if (command === 'cekveriftiktok') {
      const status = pending.get(`${m.chat}:${m.sender}`)
      return m.reply(status ? `🟡 Permohonan verifikasi tercatat: ${status}\nAdmin grup perlu memeriksa profil secara manual.` : 'Belum ada permohonan verifikasi TikTok dari kamu.')
    }
    const link = (text || '').trim()
    if (!/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i.test(link))
      return m.reply('Kirim link profil TikTok setelah perintah.\nContoh: .veriftiktok https://www.tiktok.com/@username\nJangan kirim kata sandi atau kode OTP.')
    if (command === 'veriftiktok' && (isAdmin || isPartner)) {
      const target = link.match(/@([\w.]+)/)?.[1]
      if (!target) return m.reply('Link profil tidak terbaca. Gunakan link profil TikTok, bukan link video.')
      return m.reply(`ℹ️ Verifikasi resmi TikTok tidak bisa diberikan oleh bot. Profil @${target} perlu diperiksa manual oleh admin; bot tidak mengakses akun atau meminta kredensial.`)
    }
    pending.set(`${m.chat}:${m.sender}`, link)
    return m.reply('📝 Permohonan verifikasi TikTok tercatat. Admin grup akan memeriksa link profil secara manual. Ini bukan centang biru resmi TikTok. Jangan pernah mengirim password atau OTP.')
  }
}
