export function resolveSender(m) {
  return m?.sender || m?.key?.participant || m?.key?.remoteJid || '';
}

export default {
  handler: async () => {}
};
