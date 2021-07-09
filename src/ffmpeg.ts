import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

export function getFramesPerSecond(input: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let data = '';
    const process = spawn(ffmpegPath, ['-i', input]);
    process.stdout.on('data', (chunk) => {
      data += chunk;
    });
    process.stderr.on('data', (chunk) => {
      data += chunk;
    });
    process.on('close', () => {
      const fpsList = data
        .split(/\r?\n/)
        .filter((line) => line.includes('Stream'))
        .map((line) => line.match(/(\d+(?:\.\d+)?) fps/)?.[1])
        .filter((fps): fps is string => fps != null)
        .map((fps) => parseFloat(fps));
      resolve(fpsList[0] ?? null);
    });
    process.on('error', (err) => {
      reject(err);
    });
  });
}

export function extractFrames(input: string, output: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, ['-i', input, '-vsync', '0', output]);
    process.on('close', (code) => {
      resolve(code);
    });
    process.on('error', (err) => {
      reject(err);
    });
  });
}
