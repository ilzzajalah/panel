declare module 'dockerode' {
  const Docker: any;
  export default Docker;
}

declare module 'cors' {
  const cors: any;
  export default cors;
}

declare module 'ws' {
  export const WebSocketServer: any;
  export const WebSocket: any;
}
