import { startBot } from './bot.js';

startBot().catch((err) => {
  console.error('[StickerBot] Error fatal al iniciar:', err);
  process.exit(1);
});
