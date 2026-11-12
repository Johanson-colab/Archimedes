const { gunzipSync, inflateRawSync } = require('node:zlib');
const LIMIT = 128 * 1024 * 1024;
// Read just the expected executable; never extract archive paths to the filesystem.
function extractExecutable(archive, member, zip = false) {
  if (!zip) {
    const tar = gunzipSync(archive, { maxOutputLength: LIMIT });
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString().split('\0')[0];
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0/g, '').trim(), 8) || 0;
      if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid engine tar archive.');
      if (name === member && [0, 48].includes(header[156])) return tar.subarray(offset + 512, offset + 512 + size);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } else {
    let end = archive.length - 22;
    for (; end >= Math.max(0, archive.length - 65557); end--) if (archive.readUInt32LE(end) === 0x06054b50) break;
    if (end < Math.max(0, archive.length - 65557)) throw new Error('Invalid engine ZIP archive.');
    let offset = archive.readUInt32LE(end + 16);
    const count = archive.readUInt16LE(end + 10);
    for (let i = 0; i < count; i++) {
      if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid engine ZIP directory.');
      const method = archive.readUInt16LE(offset + 10);
      const compressed = archive.readUInt32LE(offset + 20), size = archive.readUInt32LE(offset + 24);
      const nameSize = archive.readUInt16LE(offset + 28), extraSize = archive.readUInt16LE(offset + 30), commentSize = archive.readUInt16LE(offset + 32);
      const name = archive.subarray(offset + 46, offset + 46 + nameSize).toString();
      if (name === member) {
        const local = archive.readUInt32LE(offset + 42);
        if (local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50 || size > LIMIT) throw new Error('Invalid engine ZIP entry.');
        const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
        if (start + compressed > archive.length) throw new Error('Truncated engine ZIP entry.');
        const raw = archive.subarray(start, start + compressed);
        const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: LIMIT }) : null;
        if (!data || data.length !== size) throw new Error('Invalid engine ZIP compression.');
        return data;
      }
      offset += 46 + nameSize + extraSize + commentSize;
    }
  }
  throw new Error(`Engine archive has no ${member}.`);
}
module.exports = { extractExecutable };
