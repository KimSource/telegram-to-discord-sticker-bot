import 'dotenv/config';
import { Telegraf } from 'telegraf';
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

      try {
        await fetchFile(ctx, fileId).then(
          (stickerFile) => {
            // TODO: 변환
            console.log(stickerFile);
            console.log('isWebp', isWebp(stickerFile));
            console.log('isGzip', isGzip(stickerFile));
            return stickerFile;
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to fetch the sticker');
          },
        ).then(
          (stickerFile) => {
            // TODO: 파일 전송
            // ctx.replyWithDocument(stickerFile);
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
