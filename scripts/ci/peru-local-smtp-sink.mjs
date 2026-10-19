import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// Buzón SMTP mínimo para ensayos locales: acepta sólo conexiones de 127.0.0.1,
// no anuncia TLS ni AUTH y guarda cada mensaje recibido. Nunca reenvía nada.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
const port = Number(process.env.LOCAL_SMTP_PORT);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536, 'LOCAL_SMTP_PORT inválido');
const directory = path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR, 'smtp');
fs.mkdirSync(directory, { recursive: true });
let sequence = 0;

const server = net.createServer(socket => {
  if (socket.remoteAddress !== '127.0.0.1' && socket.remoteAddress !== '::ffff:127.0.0.1') return socket.destroy();
  let buffer = '';
  let envelope = { from: null, to: [] };
  let data = null;
  const reply = line => socket.write(line + '\r\n');
  reply('220 erp-local-sink ESMTP');
  socket.on('data', chunk => {
    buffer += chunk.toString('latin1');
    while (true) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        data += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        const raw = Buffer.from(data.replace(/^\.\./gm, '.'), 'latin1').toString('utf8');
        const file = path.join(directory, `${String(++sequence).padStart(4, '0')}.json`);
        fs.writeFileSync(file, JSON.stringify({ receivedAt: new Date().toISOString(), ...envelope, raw }, null, 2));
        envelope = { from: null, to: [] };
        data = null;
        reply('250 2.0.0 Stored');
        continue;
      }
      const end = buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === 'EHLO') { reply('250-erp-local-sink'); reply('250 8BITMIME'); }
      else if (verb === 'HELO') reply('250 erp-local-sink');
      else if (verb === 'MAIL') { envelope.from = line.replace(/^MAIL FROM:\s*/i, ''); reply('250 2.1.0 OK'); }
      else if (verb === 'RCPT') { envelope.to.push(line.replace(/^RCPT TO:\s*/i, '')); reply('250 2.1.5 OK'); }
      else if (verb === 'DATA') { data = ''; reply('354 End data with <CR><LF>.<CR><LF>'); }
      else if (verb === 'RSET') { envelope = { from: null, to: [] }; reply('250 2.0.0 OK'); }
      else if (verb === 'NOOP') reply('250 2.0.0 OK');
      else if (verb === 'QUIT') { reply('221 2.0.0 Bye'); socket.end(); return; }
      else reply('502 5.5.2 Command not implemented');
    }
  });
  socket.on('error', () => socket.destroy());
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`LOCAL_SMTP_SINK_READY ${port}\n`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
