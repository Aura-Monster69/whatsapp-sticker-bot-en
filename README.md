# WhatsApp Sticker Bot (`dcss-stickers`)

Bot de WhatsApp que convierte **imágenes**, **videos**, **GIFs** y **enlaces de X (Twitter)** en stickers nativos de WhatsApp (`512x512` WebP) manteniendo la proporción original con **bordes 100% transparentes** y metadatos `dcss-stickers` / `dcss`.

## Requisitos del sistema
- Node.js >= 20
- `ffmpeg` (con soporte `libwebp`)
- `yt-dlp` (respaldo para videos de X)

## Instalación y primer arranque

```bash
cd /home/ubuntu/Documentos/git/whatsapp-sticker-bot
npm install
cp .env.example .env
npm start
```

1. Escanea el **código QR** que aparece en la terminal desde WhatsApp (*Dispositivos vinculados*).
2. Crea tu grupo de WhatsApp con tu cuenta (y el número del bot si usas uno secundario) y envía `!id` en ese grupo.
3. Copia el JID que responde el bot (ej. `120363000000000000@g.us`) y pégalo en `.env`:
   ```env
   ALLOWED_GROUP_JIDS=120363000000000000@g.us
   ```
4. Reinicia el bot (`npm start`).

## Tests

```bash
npm test
```
