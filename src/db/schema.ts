import { pgTable, serial, varchar, timestamp, boolean, integer, jsonb, text } from "drizzle-orm/pg-core";

export const alumnos = pgTable("alumnos", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  foto_url: varchar("foto_url", { length: 255 }),
  pictogramas: jsonb("pictogramas").$type<Record<string, string>>().default({}),
  creado_en: timestamp("creado_en").defaultNow(),
});

export const mensajes = pgTable("mensajes", {
  id: serial("id").primaryKey(),
  alumno_id: integer("alumno_id").references(() => alumnos.id),
  tipo: varchar("tipo", { length: 50 }).notNull(), // BAÑO, AGUA, HAMBRE, etc.
  confirmado: boolean("confirmado").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const confirmaciones = pgTable("confirmaciones", {
  id: serial("id").primaryKey(),
  mensaje_id: integer("mensaje_id").references(() => mensajes.id),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Tipos TypeScript
export type Alumno = typeof alumnos.$inferSelect;
export type NuevoAlumno = typeof alumnos.$inferInsert;
export type Mensaje = typeof mensajes.$inferSelect;
export type NuevoMensaje = typeof mensajes.$inferInsert;
export type Confirmacion = typeof confirmaciones.$inferSelect;

// Mensajes válidos del ESP32
export const MENSAJES_VALIDOS = [
  "BAÑO",
  "AGUA",
  "HAMBRE",
  "ME_DUELE",
  "AYUDA",
  "TERMINE",
  "CANSADO",
  "INCOMODO",
  "SALIR",
] as const;

export type TipoMensaje = typeof MENSAJES_VALIDOS[number];
