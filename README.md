# TablEA Backend

Backend IoT para **TablEA** — Tablero de comunicación aumentativa para niños con TEA.

## Stack

- **Runtime:** Bun
- **Framework:** Hono
- **Base de datos:** PostgreSQL + Drizzle ORM
- **Mensajería IoT:** MQTT con Mosquitto
- **Tiempo real:** WebSocket nativo de Hono

## Arquitectura

```
ESP32 (botón presionado)
  ↓ MQTT topic: tablea/boton
Mosquitto Broker (VPS)
  ↓
Hono + Bun (VPS :3000)
  ↓              ↓
PostgreSQL    WebSocket (/ws)
                ↓
          App Flutter / Web
```

## Instalación en Ubuntu 20.04 (VPS)

### 1. Instalar Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### 2. Instalar PostgreSQL

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Crear base de datos y usuario
sudo -u postgres psql -c "CREATE USER tablea_user WITH PASSWORD 'tu_password_seguro';"
sudo -u postgres psql -c "CREATE DATABASE tablea OWNER tablea_user;"
```

### 3. Instalar Mosquitto (broker MQTT)

```bash
sudo apt install mosquitto mosquitto-clients -y
sudo systemctl start mosquitto
sudo systemctl enable mosquitto

# Habilitar puerto 1883 sin autenticación (desarrollo)
echo "listener 1883
allow_anonymous true" | sudo tee /etc/mosquitto/conf.d/tablea.conf

sudo systemctl restart mosquitto
```

### 4. Clonar e instalar el proyecto

```bash
git clone https://github.com/TU_USUARIO/tablea-backend.git
cd tablea-backend
bun install
```

### 5. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Llenar con tus datos:

```env
DATABASE_URL=postgresql://tablea_user:tu_password_seguro@localhost:5432/tablea
MQTT_HOST=localhost
MQTT_PORT=1883
PORT=3000
```

### 6. Crear tablas en la base de datos

```bash
bun run db:push
```

### 7. Iniciar el servidor

```bash
# Desarrollo con hot reload
bun run dev

# Producción
bun run start
```

El servidor estará en `http://localhost:3000`

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Info y lista de endpoints |
| `GET` | `/status` | Estado del servidor y MQTT |
| `POST` | `/mensaje` | Registrar mensaje del tablero |
| `GET` | `/historial` | Historial del día |
| `POST` | `/confirmacion` | Docente confirma "ya voy" |
| `GET` | `/perfil` | Lista de alumnos |
| `GET` | `/perfil/:id` | Perfil de un alumno |
| `POST` | `/perfil` | Crear alumno |
| `PUT` | `/perfil/:id` | Actualizar alumno |
| `WS` | `/ws` | WebSocket tiempo real |

---

## WebSocket

Conectar desde la app Flutter o web:

```
ws://TU_VPS_IP:3000/ws
```

### Eventos que recibe el cliente:

```json
// Botón presionado por el niño
{
  "evento": "boton_presionado",
  "mensaje": {
    "id": 1,
    "tipo": "BAÑO",
    "alumno_id": 1,
    "timestamp": "2026-01-01T10:30:00.000Z",
    "confirmado": false
  }
}

// Confirmación del docente enviada al ESP32
{
  "evento": "confirmacion",
  "mensaje_id": 1,
  "timestamp": "2026-01-01T10:30:30.000Z"
}
```

### El cliente puede enviar:

```json
// Confirmar desde WebSocket (alternativa al endpoint REST)
{
  "accion": "confirmar",
  "mensaje_id": 1,
  "alumno_id": 1
}
```

---

## Mensajes válidos del ESP32

`BAÑO` | `AGUA` | `HAMBRE` | `ME_DUELE` | `AYUDA` | `TERMINE` | `CANSADO` | `INCOMODO` | `SALIR`

El ESP32 publica al topic `tablea/boton` con este payload:

```json
{ "tipo": "BAÑO", "alumno_id": 1 }
```

O simplemente el string: `BAÑO`

---

## Producción con PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar con PM2
pm2 start "bun run start" --name tablea-backend
pm2 save
pm2 startup
```

## Firewall

```bash
sudo ufw allow 3000/tcp   # API y WebSocket
sudo ufw allow 1883/tcp   # MQTT (solo si el ESP32 conecta desde fuera)
```
