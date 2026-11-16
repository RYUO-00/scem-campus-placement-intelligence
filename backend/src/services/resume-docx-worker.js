import { parentPort, workerData } from 'node:worker_threads';
import mammoth from 'mammoth';

try {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(workerData) });
  parentPort.postMessage({ ok: true, text: result.value });
} catch {
  parentPort.postMessage({ ok: false });
} finally {
  parentPort.close();
}
