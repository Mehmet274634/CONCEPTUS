import { startConceptusServer } from './index.ts';

const { launchUrl } = await startConceptusServer();
console.log(process.argv.includes('--vite-dev')
  ? launchUrl.replace(new URL(launchUrl).origin, 'http://127.0.0.1:5173')
  : launchUrl);
