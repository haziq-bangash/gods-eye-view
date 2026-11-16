import { createServer } from 'node:http';
import { budgetNotice, overCap, revoke } from './cap.mjs';

const project = process.env.PROJECT_ID;
const member = `serviceAccount:${process.env.VERTEX_SERVICE_ACCOUNT}`;
const stopAt = Number(process.env.STOP_AT || 0.9);

createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', async () => {
    let envelope = null;
    try {
      envelope = JSON.parse(raw);
    } catch {}
    const notice = budgetNotice(envelope);
    // Anything unreadable is acknowledged so Pub/Sub does not retry it forever.
    if (!notice || !overCap(notice, stopAt)) {
      console.log(JSON.stringify({ notice, action: 'none' }));
      res.writeHead(204).end();
      return;
    }
    try {
      const removed = await revoke(project, member);
      console.log(
        JSON.stringify({ notice, action: removed ? 'revoked' : 'already' }),
      );
      res.writeHead(204).end();
    } catch (error) {
      // A 500 makes Pub/Sub deliver again, so a passing failure is retried.
      console.error(JSON.stringify({ notice, error: String(error) }));
      res.writeHead(500).end();
    }
  });
}).listen(Number(process.env.PORT || 8080));
