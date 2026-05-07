# WhatsFake

Prototipo académico de mensajería estilo WhatsApp/Telegram (sin llamadas), construido con **React + Vite**.

## Estrategia de ramas

- `indexed`: versión actual del frontend con persistencia local en **IndexedDB**.
- `main`: rama objetivo para la versión conectada a persistencia real en backend/base de datos.

Recomendación de flujo:

1. Continúa desarrollo del prototipo/local-first en `indexed`.
2. Implementa integración de persistencia real en `main`.
3. Haz merges selectivos de UI/UX desde `indexed` hacia `main` cuando aplique.

## Stack

- React 19
- Vite 6
- WebSocket nativo (`ws` backend)
- IndexedDB (cache/persistencia local)

## Requisitos

- Node.js 20+
- npm 10+
- Backend corriendo (por defecto `http://localhost:3000`)

## Variables de entorno

Crea `.env` en la raíz:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

Compatibilidad: también acepta `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_SOCKET_URL`.

## Instalación

```bash
npm install
```

## Scripts

- `npm run dev`: desarrollo local
- `npm run build`: build de producción
- `npm run preview`: previsualizar build

## Estado funcional actual (`indexed`)

- Login con username + contraseña
- Lista de chats y contactos
- Chat en tiempo real (WebSocket)
- Eventos soportados: `message_received`, `message_ack`, `message_status_updated`, `typing`, `read`, presencia
- Grupos: creación, miembros, roles
- Ajustes de perfil local (nombre/avatar)
- Persistencia local con IndexedDB:
  - sesión
  - chats
  - contactos
  - outbox (mensajes pendientes/reintentos)

## Nota de arquitectura

En `indexed`, la fuente local permite continuidad offline parcial y UX fluida.
La persistencia compartida/multi-dispositivo debe consolidarse en la rama `main` contra backend + base de datos.
