// A minimal WebSocket server (RFC 6455) on Node's built-in http and crypto, so
// the table server has no dependencies. Text messages only, which is all the
// table protocol uses.
//
//   acceptWebSocket(req, socket, { maxPayload }) -> conn | null
//   conn.maxPayload can be changed while open (the table server raises it for the DM)
//   conn.send(string), conn.close(), conn.onmessage = (string) => {}, conn.onclose = () => {}
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function acceptWebSocket(req, socket, { maxPayload = 256 * 1024 } = {}) {
  const key = req.headers["sec-websocket-key"];
  if (req.headers.upgrade?.toLowerCase() !== "websocket" || !key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return null;
  }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  const conn = { onmessage: null, onclose: null, open: true, maxPayload };
  let buf = Buffer.alloc(0), parts = [], partsSize = 0;

  const frame = (opcode, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | opcode, n])
      : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255])
      : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
    return Buffer.concat([head, payload]);
  };
  const shut = () => {
    if (!conn.open) return;
    conn.open = false;
    socket.destroy();
    conn.onclose?.();
  };
  conn.send = (text) => { if (conn.open) socket.write(frame(0x1, Buffer.from(String(text)))); };
  // Too large: say so with the standard close code (1009) rather than just dropping the line.
  const tooBig = () => {
    if (!conn.open) return;
    socket.write(frame(0x8, Buffer.from([0x03, 0xf1])));
    shut();
  };
  conn.close = () => { if (conn.open) { socket.write(frame(0x8, Buffer.alloc(0))); shut(); } };

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, opcode = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(conn.maxPayload)) return tooBig();
        len = Number(big); off = 10;
      }
      if (!masked) return shut();                                // clients must mask
      if (len > conn.maxPayload) return tooBig();
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (opcode === 0x8) return conn.close();
      if (opcode === 0x9) { socket.write(frame(0xa, payload)); continue; }   // ping -> pong
      if (opcode === 0xa) continue;
      if (opcode !== 0x1 && opcode !== 0x0) return shut();      // binary is not part of the protocol
      parts.push(payload); partsSize += len;
      if (partsSize > conn.maxPayload) return tooBig();
      if (!fin) continue;
      const text = Buffer.concat(parts).toString("utf8");
      parts = []; partsSize = 0;
      conn.onmessage?.(text);
      if (!conn.open) return;
    }
  });
  socket.on("close", shut);
  socket.on("error", shut);
  return conn;
}
