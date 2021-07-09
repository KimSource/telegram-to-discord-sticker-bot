import 'dotenv/config';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import sharp from 'sharp';
import { Telegraf } from 'telegraf';
import { convert as convertTgsToLottie } from 'tgs2lottie';
import UPNG from 'upng-js';
import { extractFrames, getFramesPerSecond } from './ffmpeg';
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
    } else if ('animation' in ctx.message && ctx.message.animation.mime_type === 'video/mp4') {
      const replyMessage = await ctx.reply('Downloading file');
      const fileId = ctx.message.animation.file_id;
      const fileName = (ctx.message.animation.file_name ?? 'Sticker').replace(/(\.gif)?\.mp4$/, '') + '.png';
      let tempFileWritten = false;

      try {
        await fetchFile(ctx, fileId).then(
          async (animationFile) => {
            await mkdir(`./.temp/${ctx.update.update_id}`, { recursive: true });
            await writeFile(`./.temp/${ctx.update.update_id}/input.mp4`, animationFile);
            const fps = await getFramesPerSecond(`./.temp/${ctx.update.update_id}/input.mp4`);
            await extractFrames(`./.temp/${ctx.update.update_id}/input.mp4`, `./.temp/${ctx.update.update_id}/output-%04d.png`);
            tempFileWritten = true;
            const pngFileNames = (await readdir(`./.temp/${ctx.update.update_id}`)).filter((fileName) => fileName.match(/^output/));
            return {
              pngFiles: await Promise.all(pngFileNames.map((pngFileName) => readFile(`./.temp/${ctx.update.update_id}/${pngFileName}`))),
              fps,
            };
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to fetch the animation');
          },
        ).then(
          async ({ pngFiles, fps }) => ({
            pngFiles: await Promise.all(pngFiles.map((pngFile) => sharp(pngFile)
              .resize({
                fit: sharp.fit.contain,
                width: 320,
                height: 320,
                background: '#0000',
              })
              .png()
              .toBuffer(),
            )),
            fps,
          }),
        ).then<{ data: string | Buffer; fileName: string; }>(
          ({ pngFiles, fps }) => {
            const arrayBuffers = pngFiles.map((pngFile) => pngFile.buffer.slice(pngFile.byteOffset, pngFile.byteOffset + pngFile.byteLength));
            const decodedList = arrayBuffers.map((arrayBuffer) => UPNG.toRGBA8(UPNG.decode(arrayBuffer))).reduce((acc, cur) => acc.concat(cur), []);
            const delayPerFrame = 1000 / (fps ?? 15);
            const delay = new Array(decodedList.length).fill(0).map((_, i) => delayPerFrame * (i + 1)).map((v, i, a) => Math.round(v) - Math.round(a[i - 1] ?? 0));
            const encoded = UPNG.encode(decodedList, 320, 320, 0, delay);
            return { data: Buffer.from(encoded), fileName };
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to convert the animation');
          },
        ).then(
          (sticker) => {
            return ctx.replyWithDocument({ source: Buffer.from(sticker.data), filename: sticker.fileName });
          },
          (err) => {
            console.error(err);
            throw new Error('Failed to convert the animation');
          },
        ).finally(async () => {
          if (tempFileWritten) {
            try {
              await rm(`./.temp/${ctx.update.update_id}`, { recursive: true });
            } catch {
              // noop
            }
          }
        });
        await ctx.telegram.deleteMessage(replyMessage.chat.id, replyMessage.message_id);
      } catch (err) {
        await ctx.telegram.editMessageText(replyMessage.chat.id, replyMessage.message_id, undefined, err?.message || 'Unknown error');
      }
    } else {
      await ctx.reply('Send me a sticker to use on Discord');
    }
    return next();
  });

  bot.catch((err) => {
    console.error(err);
  });

  bot.launch().then(() => {
    console.log('Telegram bot launched');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
