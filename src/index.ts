import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { serve } from "@hono/node-server";

// Cargar variables de entorno
import "dotenv/config";

import { testConnection } from "./db";
import { initMQTT, getMQTTStatus } from "./mqtt/client";
import { addClient, removeClient, broadcast } from "./ws/manager";
import mensajesRoute from "./routes/mensajes";
import perfilRoute from "./routes/perfil";

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Middlewares
app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// ─── Rutas REST ───────────────────────────────────────────────────────────────

app.get("/", (c) =>
  c.json({
    proyecto: "TablEA Backend",
    version: "1.0.0",
    descripcion: "Tablero de comunicación aumentativa para niños con TEA",
    endpoints: {
      "POST /mensaje": "Registrar mensaje del tablero",
      "GET /historial": "Historial del día",
      "POST /confirmacion": "Docente confirma recepción",
      "GET /perfil/:id": "Datos del alumno",
      "WS /ws": "WebSocket tiempo real",
      "GET /status": "Estado del servidor",
    },
  })
);

app.get("/status", (c) =>
  c.json({
    ok: true,
    timestamp: new Date().toISOString(),
    mqtt: getMQTTStatus(),
  })
);

app.route("/mensaje", mensajesRoute);
app.route("/perfil", perfilRoute);

// ─── WebSocket ────────────────────────────────────────────────────────────────

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_, ws) {
      const raw = ws.raw as WebSocket;
      addClient(raw);

      // Enviar bienvenida
      raw.send(
        JSON.stringify({
          evento: "conectado",
          mensaje: "TablEA WebSocket activo",
          timestamp: new Date().toISOString(),
        })
      );
    },

    onMessage(event, ws) {
      // El docente puede enviar confirmaciones también por WS
      try {
        const data = JSON.parse(event.data.toString());

        if (data.accion === "confirmar" && data.mensaje_id) {
          // Redirigir al endpoint de confirmación
          fetch(`http://localhost:${process.env.PORT || 3000}/confirmacion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mensaje_id: data.mensaje_id,
              alumno_id: data.alumno_id,
            }),
          });
        }
      } catch {
        // Mensaje no JSON, ignorar
      }
    },

    onClose(_, ws) {
      removeClient(ws.raw as WebSocket);
    },

    onError(error) {
      console.error("❌ Error WebSocket:", error);
    },
  }))
);

// ─── Inicio del servidor ──────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3000");

async function main() {
  console.log("🚀 Iniciando TablEA Backend...");

  // Verificar conexión a base de datos
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error("❌ No se pudo conectar a la base de datos. Verifica DATABASE_URL en .env");
    process.exit(1);
  }

  // Iniciar cliente MQTT
  initMQTT();

  // Iniciar servidor HTTP + WebSocket
  Bun.serve({
    fetch: app.fetch,
    websocket,
    port: PORT,
  });

  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket disponible en ws://localhost:${PORT}/ws`);
  console.log(`📖 Documentación en http://localhost:${PORT}/`);
}

main().catch(console.error);
