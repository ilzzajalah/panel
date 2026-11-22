const records = new Map()
const dayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
export default {
  command: ['absen','hadir','rekapabsen'],
  category: 'community',
  async run(m, { command }) {
    const key = `${m.chat}:${dayKey()}`
    if (!records.has(key)) records.set(key, new Map())
    const list = records.get(key)
    if (command === 'rekapabsen') {
      if (!list.size) return m.reply('Belum ada absensi hari ini.')
      return m.reply(`📋 ABSENSI ${dayKey()}\n` + [...list.values()].map((v, i) => `${i+1}. ${v}`).join('\n'))
    }
    if (list.has(m.sender)) return m.reply('✅ Kamu sudah absen hari ini.')
    list.set(m.sender, m.pushName || m.sender.split('@')[0])
    return m.reply(`✅ Absensi berhasil!\nNama: ${m.pushName || '-'}\nTanggal: ${dayKey()}\nTotal hadir: ${list.size}`)
  }
}
