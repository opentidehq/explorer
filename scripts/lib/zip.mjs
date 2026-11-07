import zlib from "node:zlib";

/**
 * The files of a zip archive, read from its central directory: enough for the language
 * server's release zip (stored and deflated entries, no zip64, no encryption), with no
 * dependency. Directories are left out.
 * @param {Buffer} zip
 * @returns {Array<{ name: string, data: Buffer }>}
 */
export function readZip(zip) {
  // End of central directory: 22 bytes plus a comment of up to 64 KiB, at the end.
  const floor = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= floor; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip archive");
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);

  /** @type {Array<{ name: string, data: Buffer }>} */
  const files = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) {
      throw new Error("corrupt zip central directory");
    }
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (flags & 0x1) throw new Error(`${name}: encrypted zip entries`);
    if (zip.readUInt32LE(local) !== 0x04034b50) {
      throw new Error(`${name}: corrupt local header`);
    }
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`${name}: unsupported zip method ${method}`);
    if (data.length !== size) throw new Error(`${name}: size mismatch`);
    files.push({ name, data });
  }
  return files;
}
