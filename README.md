# 🤖 Bot de Stickers para WhatsApp (`dcss-stickers`)

Convierte cualquier **imagen**, **video corto**, **GIF** o **enlace de X (Twitter)** que envíes a un grupo de WhatsApp en un **sticker** (manteniendo su forma original con bordes transparentes).

---

## 📋 Antes de empezar: ¿qué necesitas?

1. **Un computador** (Windows, Mac o Linux) o **un celular Android viejo** (con Termux) donde dejar el bot encendido.
   > ⚠️ **Importante:** Mientras la ventana/terminal donde arrancaste el bot esté abierta, el bot funciona. Si apagas el PC o cierras esa ventana, el bot se detiene hasta que lo vuelvas a abrir.
2. **Una cuenta de WhatsApp** (puede ser un número secundario solo para el bot, o tu propio WhatsApp).

---

## 🛠️ Paso 1: Instalar los programas necesarios (solo se hace una vez)

Abre la terminal de tu equipo:
- **En Windows:** Presiona la tecla `Windows`, escribe **`PowerShell`** y ábrelo.
- **En Mac:** Presiona `Cmd + Espacio`, escribe **`Terminal`** y ábrelo.

Luego copia y pega **todo el bloque** correspondiente a tu sistema y presiona `Enter`:

### 🪟 Windows (PowerShell)
```powershell
winget install Git.Git OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp.yt-dlp
```
*(Si te pide confirmar o aceptar términos, escribe `Y` y presiona `Enter`. Cuando termine, **cierra PowerShell y ábrelo de nuevo**.)*

### 🍎 Mac (Terminal)
*(Si no tienes Homebrew instalado, primero instálalo desde https://brew.sh)*
```bash
brew install git node ffmpeg yt-dlp
```

### 🐧 Linux (Ubuntu / Debian)
```bash
sudo apt update && sudo apt install -y git nodejs npm ffmpeg pipx
pipx install yt-dlp
```

### 📱 Celular Android viejo (usando Termux)
1. Descarga **Termux** desde [F-Droid](https://f-droid.org/packages/com.termux/) (no uses la versión de Play Store porque está desactualizada).
2. Ábrelo y ejecuta:
```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs ffmpeg python
pip install yt-dlp
```

---

## 📥 Paso 2: Descargar el bot e instalarlo

En la misma terminal, copia y pega línea por línea:

```bash
git clone https://github.com/Daniel-Cossio/whatsapp-sticker-bot.git
cd whatsapp-sticker-bot
npm install
```

Ahora crea tu archivo de configuración:
- **En Windows (PowerShell):**
  ```powershell
  copy .env.example .env
  ```
- **En Mac / Linux / Termux:**
  ```bash
  cp .env.example .env
  ```

*(Opcional)* Si quieres cambiar el nombre del pack de stickers o el autor, abre el archivo `.env` con el **Bloc de notas** (Windows) o **TextEdit** (Mac) y edita estas dos líneas:
```env
STICKER_PACK_NAME=dcss-stickers
STICKER_AUTHOR=dcss
```

---

## 📱 Paso 3: Conectar tu WhatsApp (Escanear QR)

1. Arranca el bot ejecutando:
   ```bash
   npm start
   ```
2. En la pantalla aparecerá un **código QR grande**.
3. Abre **WhatsApp en tu teléfono** → toca **Menú (⋮) / Configuración** → **Dispositivos vinculados** → **Vincular un dispositivo** → apunta la cámara al QR de la pantalla.
4. Cuando veas el mensaje **`[StickerBot] Conectado a WhatsApp correctamente.`**, ya está vinculado.

---

## 👥 Paso 4: Configurar tu grupo privado de stickers

Para que el bot no le responda a todo el mundo, solo funciona en el grupo que tú elijas:

1. Crea un **grupo nuevo en WhatsApp** (por ejemplo, llamado *"Mis Stickers"*).
   - Si usas un número secundario para el bot, agrégalo al grupo.
   - Si usas tu propio WhatsApp, crea el grupo con alguien de confianza y luego si quieres lo sacas para quedarte solo tú.
2. Envía este mensaje exacto dentro del grupo:
   ```text
   !id
   ```
3. El bot te responderá con un código parecido a `120363000000000000@g.us`. **Cópialo.**
4. Abre el archivo `.env` (con el Bloc de notas / TextEdit) y pégalo después del `=`:
   ```env
   ALLOWED_GROUP_JIDS=120363000000000000@g.us
   ```
5. **Guarda el archivo `.env`**, vuelve a la terminal, detén el bot presionando **`Ctrl + C`** y vuelve a arrancarlo:
   ```bash
   npm start
   ```

---

## 🎉 ¡Listo! ¿Cómo se usa?

Envía al grupo autorizado cualquiera de estas cosas:
- 🖼️ **Una foto o imagen** → te devuelve un sticker estático.
- 🎞️ **Un GIF o video corto** (máx. 8 segundos) → te devuelve un sticker animado.
- 🐦 **Un link de X / Twitter** (de una foto, GIF o video) → lo descarga y te lo convierte en sticker.

El bot reacciona a tu mensaje para avisarte:
- `⏳` Procesando...
- `✅` ¡Sticker enviado!
- `❌` Hubo un error (ej. el enlace no tiene imagen/video o el tweet es privado).

---

## ❓ Preguntas frecuentes

- **¿Tengo que escanear el QR cada vez que lo abro?**
  No. La sesión se guarda en la carpeta `auth_info/`. La próxima vez que ejecutes `npm start` dentro de la carpeta `whatsapp-sticker-bot`, se conecta solo.
- **¿Cómo lo dejo encendido 24/7 sin tener que dejar mi PC prendido?**
  Puedes montarlo gratis en:
  - **Un celular Android viejo** con **Termux** conectado al cargador.
  - **Una Raspberry Pi / Mini PC** en casa.
  - **Oracle Cloud (Always Free)** o **Google Cloud (`e2-micro` Free Tier)** si tienes tarjeta para verificar la cuenta (costo $0/mes).
  *(Evita planes gratuitos de Vercel, Netlify o Render/Koyeb sin disco persistente, porque apagan el bot o borran `auth_info/` al reiniciar.)*
- **Me sale error de `ffmpeg` o `yt-dlp`:**
  Asegúrate de haber cerrado y vuelto a abrir la terminal después del Paso 1. En Windows, si `yt-dlp` sigue sin reconocerse, revisa que esté instalado ejecutando `yt-dlp --version`.
