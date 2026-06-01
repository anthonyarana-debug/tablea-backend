import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { testConnection } from "./db";
import { initMQTT, getMQTTStatus } from "./mqtt/client";
import { addClient, removeClient } from "./ws/manager";
import mensajesRoute from "./routes/mensajes";
import perfilRoute from "./routes/perfil";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("*", cors({ origin: "*" }));
app.use("*", logger());

app.get("/", (c) => c.json({ proyecto: "TablEA Backend", version: "1.0.0" }));
app.get("/status", (c) => c.json({ ok: true, timestamp: new Date().toISOString(), mqtt: getMQTTStatus() }));
app.route("/mensaje", mensajesRoute);
app.route("/perfil", perfilRoute);

app.get("/ws", upgradeWebSocket(() => ({
  onOpen(_, ws) {
    addClient(ws as any);
    ws.send(JSON.stringify({ evento: "conectado", mensaje: "TablEA WebSocket activo", timestamp: new Date().toISOString() }));
  },
  onMessage(event, ws) {
    try {
      const data = JSON.parse(event.data.toString());
      if (data.accion === "confirmar" && data.mensaje_id) {
        fetch(`http://localhost:${process.env.PORT || 3000}/mensaje/confirmacion`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje_id: data.mensaje_id, alumno_id: data.alumno_id }),
        });
      }
    } catch {}
  },
  onClose(_, ws) { removeClient(ws as any); },
})));

const PORT = parseInt(process.env.PORT || "3000");

async function main() {
  console.log("🚀 Iniciando TablEA Backend...");
  const dbOk = await testConnection();
  if (!dbOk) { console.error("❌ Error PostgreSQL"); process.exit(1); }
  initMQTT();
  const server = serve({ fetch: app.fetch, port: PORT });
  injectWebSocket(server);
  console.log(`✅ Servidor en http://localhost:${PORT}`);
  console.log(`📡 WebSocket en ws://localhost:${PORT}/ws`);
}

main().catch(console.error);
