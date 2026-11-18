# 🤖 WhatsApp Sticker Bot (`dcss-stickers`)

Converts any **image**, **short video**, **GIF**, or **X (Twitter) link** sent to a WhatsApp group into a **sticker** (preserving its original aspect ratio with transparent borders).

---

## 📋 Prerequisites: What do you need?

1. **A computer** (Windows, Mac, or Linux), a cloud host (e.g. Render, VPS), or **an old Android phone** (with Termux) where the bot can stay running.
   > ⚠️ **Important:** As long as the terminal/command prompt window running the bot is open, the bot will work. If you turn off your PC or close that window, the bot stops until you start it again.
2. **A WhatsApp account** (can be a secondary phone number dedicated to the bot, or your own WhatsApp account).

---

## 🛠️ Step 1: Install required software (one-time setup for local running)

Open your terminal:
- **Windows:** Press the `Windows` key, search for **`PowerShell`**, and open it.
- **Mac:** Press `Cmd + Space`, search for **`Terminal`**, and open it.

Then copy and paste the entire command block for your operating system and press `Enter`:

### 🪟 Windows (PowerShell)
```powershell
winget install Git.Git OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp.yt-dlp
```
*(If prompted to accept agreements or terms, type `Y` and press `Enter`. When finished, **close PowerShell and open it again**.)*

### 🍎 Mac (Terminal)
*(If you do not have Homebrew installed, install it first from https://brew.sh)*
```bash
brew install git node ffmpeg yt-dlp
```

### 🐧 Linux (Ubuntu / Debian)
```bash
sudo apt update && sudo apt install -y git nodejs npm ffmpeg pipx
pipx install yt-dlp
```

### 📱 Old Android Phone (using Termux)
1. Download **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/) (do not use the Play Store version as it is outdated).
2. Open Termux and run:
```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs ffmpeg python
pip install yt-dlp
```

---

## 📥 Step 2: Download and install the bot

In the same terminal, copy and run:

```bash
git clone https://github.com/Daniel-Cossio/whatsapp-sticker-bot.git
cd whatsapp-sticker-bot
npm install
```

Now create your configuration file:
- **Windows (PowerShell):**
  ```powershell
  copy .env.example .env
  ```
- **Mac / Linux / Termux:**
  ```bash
  cp .env.example .env
  ```

*(Optional)* If you want to customize the sticker pack name or author, open the `.env` file in **Notepad** (Windows) or **TextEdit** (Mac) and edit these two lines:
```env
STICKER_PACK_NAME=dcss-stickers
STICKER_AUTHOR=dcss
```

---

## 📱 Step 3: Link your WhatsApp (Scan QR Code)

1. Start the bot by running:
   ```bash
   npm start
   ```
2. A **large QR code** will appear in your terminal (or visit `http://localhost:3000/qr` in your browser).
3. Open **WhatsApp on your phone** → tap **Menu (⋮) / Settings** → **Linked Devices** → **Link a Device** → point your camera at the QR code.
4. When you see the message **`[StickerBot] Conectado a WhatsApp correctamente.`** (Connected to WhatsApp successfully), the device is linked.

---

## 👥 Step 4: Configure your private sticker group

To prevent the bot from responding to every chat, it only listens in the group(s) you authorize:

1. Create a **new group on WhatsApp** (for example, named *"My Stickers"*).
   - If using a secondary number for the bot, add it to the group.
   - If using your own WhatsApp, create the group with someone you trust, then remove them so only you remain.
2. Send this exact message inside the group:
   ```text
   !id
   ```
3. The bot will reply with a group ID like `120363000000000000@g.us`. **Copy it.**
4. Open the `.env` file and paste the ID after the `=` sign:
   ```env
   ALLOWED_GROUP_JIDS=120363000000000000@g.us
   ```
5. **Save the `.env` file**, return to the terminal, stop the bot with **`Ctrl + C`**, and restart it:
   ```bash
   npm start
   ```

---

## ☁️ Deploying to Render (24/7 with UptimeRobot)

The project includes an embedded HTTP server and a `Dockerfile` that packages `ffmpeg` and `yt-dlp` automatically.

### 1. HTTP Endpoints
- `GET /health` or `GET /ping`: Returns `{"status":"ok","bot":"connected","uptime":...}` (Use this for UptimeRobot).
- `GET /qr`: Displays a clean web page with the WhatsApp QR code to link your phone without relying on terminal logs.
- `GET /`: Returns service metadata and status.

### 2. Deploying on Render
1. Push your repository to GitHub.
2. Log in to [Render](https://render.com) and click **New +** → **Web Service**.
3. Select your repository.
4. Render will detect the `Dockerfile`:
   - **Environment:** Docker
   - **Plan:** Free
5. Under **Environment Variables**, add:
   - `ALLOWED_GROUP_JIDS`: `120363000000000000@g.us` (your group ID)
   - `STICKER_PACK_NAME`: `dcss-stickers` (optional)
   - `STICKER_AUTHOR`: `dcss` (optional)
6. Click **Create Web Service**.
7. Once deployed, visit `https://<your-app>.onrender.com/qr` in your browser to scan the QR code with WhatsApp.

### 3. Setting Up UptimeRobot (Keep-Alive)
Render's free tier spins down services after 15 minutes of inactivity. To keep it awake 24/7:
1. Go to [UptimeRobot](https://uptimerobot.com) and create a free account.
2. Click **Add New Monitor**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `WhatsApp Sticker Bot`
   - **URL (or IP):** `https://<your-app>.onrender.com/health`
   - **Monitoring Interval:** `5 minutes` or `10 minutes`
3. Click **Create Monitor**. UptimeRobot will ping the health endpoint periodically, preventing Render from going to sleep.

> ⚠️ **Render Free Tier Caveats:**
> - **Ephemeral Storage:** Render's free tier wipes disk storage on rebuilds or hard restarts. If the container restarts or redeploys, you will need to re-link by visiting `/qr`.
> - **750 Free Hours/Month:** Render gives 750 free instance hours per month across your account. One service running 24/7 uses ~720–744 hours/month. Ensure you do not have other active free Web Services on the same account to avoid running out of hours.

---

## 🎉 Ready! How to use it?

Send any of the following to your authorized group:
- 🖼️ **A photo or image** → returns a static sticker.
- 🎞️ **A GIF or short video** (max 8 seconds) → returns an animated sticker.
- 🐦 **An X / Twitter link** (containing a photo, GIF, or video) → downloads and converts it into a sticker.

The bot reacts to your message with emojis to indicate status:
- `⏳` Processing...
- `✅` Sticker sent!
- `❌` Error encountered (e.g., tweet has no media or is from a private account).

---

## ❓ Frequently Asked Questions (FAQ)

- **Do I have to scan the QR code every time I start it?**
  No, as long as `auth_info/` is preserved. On a local computer or VPS, it stays saved. On ephemeral hosts (like Render Free), you will need to re-scan if Render redeploys or restarts the container.
- **How can I keep it running 24/7 completely free without re-scanning?**
  - **An old Android phone** running **Termux** connected to a charger.
  - **A Raspberry Pi / Home Mini PC**.
  - **Oracle Cloud (Always Free)** or **Google Cloud (`e2-micro` Free Tier)** with persistent disk ($0/month).
- **Error regarding `ffmpeg` or `yt-dlp`:**
  Make sure you closed and reopened your terminal after Step 1. On Windows, verify `yt-dlp` is recognized by running `yt-dlp --version`.
