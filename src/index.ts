import { launchBot } from './app';

if (require.main === module) {
  const token = process.env.BOT_TOKEN;

  if (token) {
    launchBot(token);
  } else {
    console.error('BOT_TOKEN is empty');
  }
}

export { launchBot as launchApp };
