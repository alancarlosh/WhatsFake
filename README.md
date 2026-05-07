# WhatsFake (React + Vite)

Prototipo académico de mensajería estilo WhatsApp/Telegram (sin llamadas), con frontend web en React.

## Objetivo de esta rama (`main`)

Esta rama está orientada a **persistencia real en backend/base de datos**.
El frontend trabaja en modo **remote-first** para chats y contactos.

## Requisitos

- Node.js 20+
- Backend API/WebSocket corriendo (por defecto `http://localhost:3000`)

## Variables de entorno

Archivo `.env` (raíz):

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_PERSISTENCE_MODE=remote
```

Compatibilidad: también acepta `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_SOCKET_URL`.

### `VITE_PERSISTENCE_MODE`

- `remote` (default):
  - Chats/contactos se leen del backend (DB real).
  - No se usa cache IndexedDB para hidratar/guardar chats/contactos.
- `indexed`:
  - Mantiene estrategia local-first de cache para chats/contactos.

Nota: la sesión local y el outbox de reintentos siguen usando almacenamiento local para UX.

## Scripts

- `npm run dev`: desarrollo local
- `npm run build`: build de producción
- `npm run preview`: preview del build

## Flujo funcional actual

- Login con username + contraseña
- Lista de chats/contactos y sala de chat
- WebSocket en tiempo real (`message_received`, `message_ack`, `typing`, `read`, presencia)
- Grupos: creación, detalle, miembros y roles
- Ajustes: cambio local de nombre y avatar predefinido

## Nota

Este frontend está preparado para conectarse a backend Node.js con contratos flexibles/fallbacks para prácticas académicas.
