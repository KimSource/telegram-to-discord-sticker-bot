import axios from 'axios';
import { Context } from 'telegraf';

export async function fetchFile(ctx: Context, fileId: string): Promise<Buffer> {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await axios.get<ArrayBuffer>(fileLink.href, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

function readString(buffer: Buffer, start: number, end: number): string {
  const arr: Array<string> = [];
  for (let offset = start; offset < end; offset += 1) {
    arr.push(String.fromCharCode(buffer.readUInt8(offset)));
  }
  return arr.join('');
}

export function isWebp(buffer: Buffer): boolean {
  return readString(buffer, 0, 4) === 'RIFF' && readString(buffer, 8, 12) === 'WEBP';
}

export function isGzip(buffer: Buffer): boolean {
  return readString(buffer, 0, 3) === '\x1f\x8b\x08';
}
