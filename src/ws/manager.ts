// Gestión de clientes WebSocket conectados
const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  clients.add(ws);
  console.log(`📱 Cliente WS conectado. Total: ${clients.size}`);
}

export function removeClient(ws: WebSocket) {
  clients.delete(ws);
  console.log(`📱 Cliente WS desconectado. Total: ${clients.size}`);
}

export function broadcast(data: object) {
  const message = JSON.stringify(data);
  let enviados = 0;
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      enviados++;
    }
  });
  console.log(`📡 Broadcast enviado a ${enviados} clientes`);
}

export function getClientCount() {
  return clients.size;
}
