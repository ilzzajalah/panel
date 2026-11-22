export default {
  command: ['cngen','cngenerator','cn'],
  category: 'community',
  async run(m, { text, args }) {
    const name = (text || args.join(' ')).trim().replace(/[\r\n]/g, '').slice(0, 40) || m.pushName || 'Nama'
    return m.reply(`╭─「 CN GENERATOR 」\n│ 1. ${name} 𝖋𝖙 𝙃𝙎𝙄᭄\n│ 2. ${name}〆𝙃𝙎𝙄\n│ 3. 𝗡𝗮𝗺𝗮 ${name} ` + '`𝗛𝗮𝘀𝗵𝗶𝗿𝗮流`' + `\n╰────────────`)
  }
}
