import { Hono } from "hono";
import { and, gte, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { mensajes, alumnos, confirmaciones } from "../db/schema";

const insightsRoute = new Hono();

// Modelo de Groq (gratis). Si alguno deja de existir, probá "llama-3.1-8b-instant"
const GROQ_MODEL = "llama-3.3-70b-versatile";

const ETIQUETAS: Record<string, string> = {
  "BAÑO": "ir al baño", "AGUA": "sed", "HAMBRE": "hambre", "ME_DUELE": "dolor",
  "AYUDA": "ayuda", "TERMINE": "terminó actividad", "CANSADO": "cansancio",
  "INCOMODO": "incomodidad", "SALIR": "querer salir",
};

insightsRoute.get("/", async (c) => {
  try {
    const dias = Math.min(parseInt(c.req.query("dias") || "7"), 90);
    const alumnoId = c.req.query("alumno_id") ? parseInt(c.req.query("alumno_id")!) : null;
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);

    const filtro = alumnoId
      ? and(gte(mensajes.timestamp, desde), eq(mensajes.alumno_id, alumnoId))
      : gte(mensajes.timestamp, desde);

    const filas = await db
      .select({ id: mensajes.id, tipo: mensajes.tipo, alumno_id: mensajes.alumno_id, confirmado: mensajes.confirmado, ts: mensajes.timestamp })
      .from(mensajes)
      .where(filtro);

    const listaAlumnos = await db.select().from(alumnos);
    const nombrePorId = new Map(listaAlumnos.map((a) => [a.id, a.nombre]));

    if (filas.length === 0) {
      return c.json({
        rango_dias: dias, desde: desde.toISOString(),
        alumno: alumnoId ? { id: alumnoId, nombre: nombrePorId.get(alumnoId) || null } : "todos",
        metricas: { total: 0 }, ia: null,
        nota: "Sin datos en el rango. Genera algunos pedidos para ver patrones.",
      });
    }

    const total = filas.length;
    const confirmados = filas.filter((f) => f.confirmado).length;

    const cuentaTipo: Record<string, number> = {};
    const cuentaHora: Record<number, number> = {};
    const cuentaAlumno: Record<number, number> = {};
    for (const f of filas) {
      cuentaTipo[f.tipo] = (cuentaTipo[f.tipo] || 0) + 1;
      const h = new Date(f.ts as any).getHours();
      cuentaHora[h] = (cuentaHora[h] || 0) + 1;
      if (f.alumno_id != null) cuentaAlumno[f.alumno_id] = (cuentaAlumno[f.alumno_id] || 0) + 1;
    }

    const por_tipo = Object.entries(cuentaTipo)
      .map(([tipo, count]) => ({ tipo, etiqueta: ETIQUETAS[tipo] || tipo, count }))
      .sort((a, b) => b.count - a.count);
    const por_hora = Object.entries(cuentaHora)
      .map(([hora, count]) => ({ hora: parseInt(hora), count }))
      .sort((a, b) => a.hora - b.hora);
    const por_alumno = Object.entries(cuentaAlumno)
      .map(([id, count]) => ({ alumno_id: parseInt(id), nombre: nombrePorId.get(parseInt(id)) || "-", count }))
      .sort((a, b) => b.count - a.count);

    let tiempo_espera_prom_seg: number | null = null;
    const ids = filas.map((f) => f.id);
    const confs = await db.select().from(confirmaciones).where(inArray(confirmaciones.mensaje_id, ids));
    if (confs.length > 0) {
      const tsMsg = new Map(filas.map((f) => [f.id, new Date(f.ts as any).getTime()]));
      const difs: number[] = [];
      for (const cf of confs) {
        const t0 = tsMsg.get(cf.mensaje_id as number);
        if (t0) difs.push((new Date(cf.timestamp as any).getTime() - t0) / 1000);
      }
      if (difs.length) tiempo_espera_prom_seg = Math.round(difs.reduce((a, b) => a + b, 0) / difs.length);
    }

    const metricas = {
      total, confirmados, sin_confirmar: total - confirmados,
      pct_confirmados: Math.round((confirmados / total) * 100),
      por_tipo, por_hora,
      ...(alumnoId ? {} : { por_alumno }),
      tiempo_espera_prom_seg,
    };

    const key = process.env.GROQ_API_KEY;
    if (!key) {
      return c.json({
        rango_dias: dias, desde: desde.toISOString(),
        alumno: alumnoId ? { id: alumnoId, nombre: nombrePorId.get(alumnoId) || null } : "todos",
        metricas, ia: null, nota: "Agrega GROQ_API_KEY al .env para el analisis con IA.",
      });
    }

    const sujeto = alumnoId ? `el alumno ${nombrePorId.get(alumnoId) || alumnoId}` : "el aula (todos los alumnos)";
    const prompt =
`Sos un asistente para docentes de educacion especial. Analizas datos de TablEA, un tablero de comunicacion para alumnos con TEA que presionan botones para expresar necesidades.

Datos de ${sujeto} en los ultimos ${dias} dias (hora en formato 24h, zona de Peru):
${JSON.stringify(metricas)}

Devolve SOLO un JSON con esta forma exacta:
{"observaciones": ["...", "..."], "sugerencia": "..."}

Reglas:
- 2 a 4 observaciones, cada una una frase corta sobre patrones reales en los datos (tipos frecuentes, franjas horarias, nivel de atencion). En espanol, claras para un docente.
- NO diagnostiques ni infieras condiciones medicas. Describi patrones de comportamiento observados, nada mas.
- La sugerencia debe ser UNA accion practica y concreta para el docente, basada en los datos.
- Si los datos son pocos, decilo con honestidad en una observacion.`;

    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Respondes siempre en espanol y SOLO con el JSON pedido, sin texto extra." },
            { role: "user", content: prompt },
          ],
        }),
      });
      const data: any = await resp.json();
      const txt = data?.choices?.[0]?.message?.content;
      let ia = null;
      if (txt) { try { ia = JSON.parse(txt); } catch { ia = { observaciones: [txt], sugerencia: "" }; } }
      else if (data?.error) { console.error("Groq error:", data.error); }

      return c.json({
        rango_dias: dias, desde: desde.toISOString(),
        alumno: alumnoId ? { id: alumnoId, nombre: nombrePorId.get(alumnoId) || null } : "todos",
        metricas, ia,
        ...(ia ? {} : { nota: "Groq no devolvio analisis; revisa la clave o el modelo." }),
      });
    } catch (e) {
      console.error("Error Groq:", e);
      return c.json({
        rango_dias: dias, desde: desde.toISOString(),
        alumno: alumnoId ? { id: alumnoId, nombre: nombrePorId.get(alumnoId) || null } : "todos",
        metricas, ia: null, nota: "No se pudo contactar a Groq; revisa la clave o la conexion.",
      });
    }
  } catch (error) {
    console.error("Error /insights:", error);
    return c.json({ error: "Error generando insights" }, 500);
  }
});

export default insightsRoute;
