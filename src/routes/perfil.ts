import { Hono } from "hono";
import { db } from "../db";
import { alumnos } from "../db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

// GET /perfil/:id — datos del alumno y sus pictogramas
app.get("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));

    const [alumno] = await db
      .select()
      .from(alumnos)
      .where(eq(alumnos.id, id));

    if (!alumno) {
      return c.json({ error: "Alumno no encontrado" }, 404);
    }

    return c.json(alumno);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error obteniendo perfil" }, 500);
  }
});

// GET /perfil — lista todos los alumnos
app.get("/", async (c) => {
  try {
    const todos = await db.select().from(alumnos);
    return c.json(todos);
  } catch (error) {
    return c.json({ error: "Error obteniendo alumnos" }, 500);
  }
});

// POST /perfil — crear alumno
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { nombre, foto_url, pictogramas } = body;

    if (!nombre) {
      return c.json({ error: "nombre requerido" }, 400);
    }

    const [alumno] = await db
      .insert(alumnos)
      .values({
        nombre,
        foto_url: foto_url || null,
        pictogramas: pictogramas || {},
      })
      .returning();

    return c.json(alumno, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error creando alumno" }, 500);
  }
});

// PUT /perfil/:id — actualizar pictogramas personalizados
app.put("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();

    const [actualizado] = await db
      .update(alumnos)
      .set(body)
      .where(eq(alumnos.id, id))
      .returning();

    if (!actualizado) {
      return c.json({ error: "Alumno no encontrado" }, 404);
    }

    return c.json(actualizado);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Error actualizando alumno" }, 500);
  }
});

export default app;
