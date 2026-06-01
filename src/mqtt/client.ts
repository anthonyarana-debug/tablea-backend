import mqtt from "mqtt";
import { db } from "../db";
import { mensajes, MENSAJES_VALIDOS, type TipoMensaje } from "../db/schema";
import { broadcast } from "../ws/manager";

let client: mqtt.MqttClient | null = null;

const TOPIC_BOTON = "tablea/boton";
const TOPIC_CONFIRMACION = "tablea/confirmacion";

export function initMQTT() {
  const host = process.env.MQTT_HOST || "localhost";
  const port = parseInt(process.env.MQTT_PORT || "1883");
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  const options: mqtt.IClientOptions = {
    host,
    port,
    protocol: "mqtt",
    ...(username && { username }),
    ...(password && { password }),
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  };

  client = mqtt.connect(options);

  client.on("connect", () => {
    console.log(`✅ MQTT conectado a ${host}:${port}`);
    client!.subscribe(TOPIC_BOTON, (err) => {
      if (err) {
        console.error("❌ Error suscribiendo a topic:", err);
      } else {
        console.log(`📡 Suscrito al topic: ${TOPIC_BOTON}`);
      }
    });
  });

  client.on("message", async (topic, payload) => {
    if (topic === TOPIC_BOTON) {
      await handleBotonPresionado(payload.toString());
    }
  });

  client.on("error", (err) => {
    console.error("❌ Error MQTT:", err);
  });

  client.on("reconnect", () => {
    console.log("🔄 Reconectando a MQTT...");
  });

  client.on("disconnect", () => {
    console.log("⚠️ MQTT desconectado");
  });
}

async function handleBotonPresionado(payload: string) {
  try {
    // El ESP32 envía JSON: { "tipo": "BAÑO", "alumno_id": 1 }
    // o simplemente el string del tipo: "BAÑO"
    let tipo: string;
    let alumno_id: number | null = null;

    try {
      const data = JSON.parse(payload);
      tipo = data.tipo?.toUpperCase();
      alumno_id = data.alumno_id || null;
    } catch {
      tipo = payload.trim().toUpperCase();
    }

    // Validar que sea un mensaje conocido
    if (!MENSAJES_VALIDOS.includes(tipo as TipoMensaje)) {
      console.warn(`⚠️ Tipo de mensaje desconocido: ${tipo}`);
      return;
    }

    // Guardar en base de datos
    const [nuevoMensaje] = await db
      .insert(mensajes)
      .values({
        tipo,
        alumno_id,
        confirmado: false,
      })
      .returning();

    console.log(`🔔 Botón presionado: ${tipo} (ID: ${nuevoMensaje.id})`);

    // Broadcast por WebSocket a todos los clientes (app Flutter / web)
    broadcast({
      evento: "boton_presionado",
      mensaje: {
        id: nuevoMensaje.id,
        tipo: nuevoMensaje.tipo,
        alumno_id: nuevoMensaje.alumno_id,
        timestamp: nuevoMensaje.timestamp,
        confirmado: false,
      },
    });
  } catch (error) {
    console.error("❌ Error procesando mensaje MQTT:", error);
  }
}

export function publicarConfirmacion(alumno_id?: number) {
  if (!client || !client.connected) {
    console.error("❌ MQTT no conectado, no se puede publicar confirmación");
    return false;
  }

  const payload = JSON.stringify({
    accion: "CONFIRMADO",
    alumno_id: alumno_id || null,
    timestamp: new Date().toISOString(),
  });

  client.publish(TOPIC_CONFIRMACION, payload, (err) => {
    if (err) {
      console.error("❌ Error publicando confirmación:", err);
    } else {
      console.log("✅ Confirmación publicada al ESP32");
    }
  });

  return true;
}

export function getMQTTStatus() {
  return {
    conectado: client?.connected || false,
    host: process.env.MQTT_HOST || "localhost",
    port: process.env.MQTT_PORT || "1883",
  };
}
