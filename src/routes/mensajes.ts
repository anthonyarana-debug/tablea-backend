import { Hono } from "hono";
import { db } from "../db";
import { mensajes, confirmaciones, MENSAJES_VALIDOS, type TipoMensaje } from "../db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { broadcast } from "../ws/manager";
import { publicarConfirmacion } from "../mqtt/client";

const app = new Hono();

// POST /mensaje — cuando el niño presiona un botón (también vía HTTP si no hay MQTT)
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { tipo, alumno_id } = body;

    if (!tipo || !MENSAJES_VALIDOS.includes(tipo.toUpperCase() as TipoMensaje)) {
      return c.json(
        {
          error: "Tipo de mensaje inválido",
          validos: MENSAJES_VALIDOS,
        },
        400
      );
    }

    const [nuevoMensaje] = await db
      .insert(mensajes)
      .values({
        tipo: tipo.toUpperCase(),
        alumno_id: alumno_id || null,
        confirmado: false,
      })
      .returning();

    // También hacer broadcast para que la web lo reciba
    broadcast({
      evento: "boton_presionado",
      mensaje: nuevoMensaje,
    });

    return c.json({ ok: true, mensaje: nuevoMensaje }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error interno del servidor" }, 500);
  }
});

// GET /historial — mensajes del día con hora y tipo
app.get("/historial", async (c) => {
  try {
    const alumno_id = c.req.query("alumno_id");
    const fecha = c.req.query("fecha"); // YYYY-MM-DD, default hoy

    const inicio = fecha
      ? new Date(`${fecha}T00:00:00.000Z`)
      : new Date(new Date().setHours(0, 0, 0, 0));

    const condiciones = alumno_id
      ? and(
          gte(mensajes.timestamp, inicio),
          eq(mensajes.alumno_id, parseInt(alumno_id))
        )
      : gte(mensajes.timestamp, inicio);

    const historial = await db
      .select()
      .from(mensajes)
      .where(condiciones)
      .orderBy(desc(mensajes.timestamp));

    return c.json({
      fecha: inicio.toISOString().split("T")[0],
      total: historial.length,
      mensajes: historial,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error obteniendo historial" }, 500);
  }
});

// POST /confirmacion — docente responde "ya voy"
app.post("/confirmacion", async (c) => {
  try {
    const body = await c.req.json();
    const { mensaje_id, alumno_id } = body;

    if (!mensaje_id) {
      return c.json({ error: "mensaje_id requerido" }, 400);
    }

    // Marcar mensaje como confirmado
    await db
      .update(mensajes)
      .set({ confirmado: true })
      .where(eq(mensajes.id, mensaje_id));

    // Registrar confirmación
    const [confirmacion] = await db
      .insert(confirmaciones)
      .values({ mensaje_id })
      .returning();

    // Publicar en MQTT para que el ESP32 encienda el LED verde
    publicarConfirmacion(alumno_id);

    // Broadcast a todos los clientes WebSocket
    broadcast({
      evento: "confirmacion",
      mensaje_id,
      timestamp: confirmacion.timestamp,
    });

    return c.json({ ok: true, confirmacion });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error procesando confirmación" }, 500);
  }
});

export default app;
