# WhatsFake (React + Vite)

Prototipo académico de mensajería estilo WhatsApp/Telegram (sin llamadas), con frontend en React web.

## Requisitos

- Node.js 20+
- Backend API/socket corriendo (por defecto `http://localhost:3000`)

## Variables de entorno

Archivo `.env` (raíz):

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

Compatibilidad: también acepta `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_SOCKET_URL`.

## Scripts

- `npm run dev`: entorno de desarrollo
- `npm run typecheck`: validación TypeScript
- `npm run build`: typecheck + build producción
- `npm run preview`: preview local del build

## Flujo funcional actual

- Login con username + contraseña
- Lista de chats/contactos y sala de chat
- Socket en tiempo real (`message_received`, `message_ack`, `typing`, `read`, presencia)
- Grupos: creación, detalle, miembros y roles
- Persistencia local con IndexedDB:
  - sesión
  - chats
  - contactos
  - outbox (mensajes pendientes/reintento)
- Ajustes: cambio local de nombre y avatar predefinido

## Nota

Este frontend está preparado para conectarse a backend Node.js con contratos flexibles/fallbacks para facilitar prácticas académicas.
