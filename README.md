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

## ¿Dónde montarlo gratis?

El bot consume pocos recursos (~250–400 MB de RAM, 1 vCPU), **no necesita puertos abiertos ni IP pública**, y solo requiere **disco persistente** para guardar `auth_info/` sin perder la sesión de WhatsApp:

- **En tu casa ($0, sin tarjeta):**
  - **PC / Mac / laptop** que mantengas encendida (Windows, macOS o Linux).
  - **Android viejo con Termux** (instalando `nodejs`, `ffmpeg` y `yt-dlp`, corriendo en `tmux`).
  - **Raspberry Pi / Mini PC** conectada a tu Wi-Fi.
- **En la nube gratis ($0/mes, requiere tarjeta para verificación):**
  - **Oracle Cloud (OCI) Always Free:** VM `e2.1.micro` o ARM `A1.Flex` permanente.
  - **Google Cloud (GCP) Free Tier:** 1 VM `e2-micro` gratis al mes (`us-west1`, `us-central1` o `us-east4`) con disco estándar de 30 GB (recomendable añadir 1–2 GB de swap).
  - **AWS (`t2.micro`/`t3.micro`) o Azure (`B1s`):** 12 meses gratis en cuentas nuevas.
  - **Estudiantes:** Con **GitHub Student Developer Pack** obtienes créditos en **DigitalOcean** ($200 USD) y **Azure** ($100 USD).
- **Qué evitar:** Tiers gratuitos de plataformas serverless o que duermen por inactividad/borran el disco al reiniciar (como Vercel, Netlify o planes free sin volumen persistente de Render/Koyeb), ya que desconectan el WebSocket y borran `auth_info/`.

