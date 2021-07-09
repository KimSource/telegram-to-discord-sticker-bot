import 'dotenv/config';
import sharp from 'sharp';
import { Telegraf } from 'telegraf';
import { convert as convertTgsToLottie } from 'tgs2lottie';
import { fetchFile, isGzip, isWebp } from './file';

export function launchBot(token: string): void {
  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    console.time(`Processing update ${ctx.update.update_id}`);
    await next();
    console.timeEnd(`Processing update ${ctx.update.update_id}`);
  });

  bot.command('start', async (ctx, next) => {
    await ctx.reply('Send me a sticker to use on Discord');
    return next();
  });

  bot.on('message', async (ctx, next) => {
    if ('sticker' in ctx.message) {
      const replyMessage = await ctx.reply('Downloading file');
      const fileId = ctx.message.sticker.file_id;
      const stickerId = ctx.message.sticker.file_unique_id;
      const stickerSetName = ctx.message.sticker.set_name ?? 'Sticker';

      try {
        await fetchFile(ctx, fileId).then<{ data: string | Buffer; fileName: string; }>(
          (stickerFile) => {
            if (isWebp(stickerFile)) {
              return sharp(stickerFile)
                .resize({
                  fit: sharp.fit.contain,
                  width: 320,
                  height: 320,
                  background: '#0000',
                })
                .png()
                .toBuffer()
                .then((data) => ({
                  data,
                  fileName: `${stickerSetName} ${stickerId}.png`,
                }));
            } else if (isGzip(stickerFile)) {
              const lottie = convertTgsToLottie(stickerFile, 320);
              const lottieJson = JSON.parse(lottie);
              return {
                data: lottie,
                fileName: (lottieJson?.nm || `${stickerSetName} ${stickerId}`) + '.json',
              };
            } else {
              throw new Error('Unsupported sticker type');
            }
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to fetch the sticker');
          },
        ).then(
          (sticker) => {
            return ctx.replyWithDocument({ source: Buffer.from(sticker.data), filename: sticker.fileName });
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to convert the sticker');
          }
        );
        await ctx.telegram.deleteMessage(replyMessage.chat.id, replyMessage.message_id);
      } catch (err) {
        await ctx.telegram.editMessageText(replyMessage.chat.id, replyMessage.message_id, undefined, err?.message || 'Unknown error');
      }
    } else {
      await ctx.reply('Send me a sticker to use on Discord');
    }
    return next();
  });

  bot.launch().then(() => {
    console.log('Telegram bot launched');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
