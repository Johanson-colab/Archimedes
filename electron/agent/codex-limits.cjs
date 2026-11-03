const OUTBOUND_PROTOCOL_LIMIT = 8 * 1024 * 1024;
const VISIBLE_IMPORT_LIMIT = 1_000_000;

// Count the actual UTF-8 JSON representation without constructing a serialized
// copy of text, image data, or nested payloads. Only plain protocol data is valid.
function assertJsonSize(value, limit = OUTBOUND_PROTOCOL_LIMIT, message = "Codex outbound protocol size limit exceeded. No request was sent or replayed.") {
  let bytes = 0;
  let nodes = 0;
  const ancestors = new Set();
  const add = count => {
    bytes += count;
    if (bytes > limit) throw new Error(message);
  };
  function string(text) {
    add(Buffer.byteLength(text, "utf8") + 2);
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92) add(1);
      else if (code <= 31) add([8, 9, 10, 12, 13].includes(code) ? 1 : 5);
      // JSON escapes lone UTF-16 surrogates, while Buffer counts replacement
      // characters. A valid surrogate pair already has the right UTF-8 size.
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index++;
        else add(3);
      } else if (code >= 0xdc00 && code <= 0xdfff) add(3);
    }
  }
  function visit(item, depth) {
    if (++nodes > 100_000 || depth > 64) throw new Error(message);
    if (item === null) return add(4);
    if (typeof item === "string") return string(item);
    if (typeof item === "boolean") return add(item ? 4 : 5);
    if (typeof item === "number") return add(Number.isFinite(item) ? String(item).length : 4);
    if (typeof item !== "object") throw new Error("Codex outbound protocol requires plain JSON data. No request was sent or replayed.");
    const prototype = Object.getPrototypeOf(item);
    const array = Array.isArray(item);
    if ((prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) || ancestors.has(item)) throw new Error("Codex outbound protocol requires acyclic plain JSON data. No request was sent or replayed.");
    for (const owner of [item, prototype, Object.prototype]) {
      const hook = owner && Object.getOwnPropertyDescriptor(owner, "toJSON");
      if (hook && (!Object.hasOwn(hook, "value") || typeof hook.value === "function")) throw new Error("Codex outbound protocol does not accept serialization hooks.");
    }
    ancestors.add(item);
    add(2);
    try {
      let count = 0;
      if (array) {
        if (item.length > 100_000) throw new Error(message);
        for (let index = 0; index < item.length; index++) {
          if (count++) add(1);
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (descriptor && !Object.hasOwn(descriptor, "value")) throw new Error("Codex outbound protocol does not accept accessors.");
          const element = descriptor?.value;
          if (["undefined", "function", "symbol"].includes(typeof element)) add(4);
          else visit(element, depth + 1);
        }
      } else {
        for (const key in item) {
          if (!Object.hasOwn(item, key)) continue;
          if (++nodes > 100_000) throw new Error(message);
          const descriptor = Object.getOwnPropertyDescriptor(item, key);
          if (!Object.hasOwn(descriptor, "value") || (key === "toJSON" && typeof descriptor.value === "function")) throw new Error("Codex outbound protocol does not accept accessors or serialization hooks.");
          if (["undefined", "function", "symbol"].includes(typeof descriptor.value)) continue;
          if (count++) add(1);
          string(key);
          add(1);
          visit(descriptor.value, depth + 1);
        }
      }
    } finally { ancestors.delete(item); }
  }
  visit(value, 0);
  return bytes;
}
module.exports = { assertJsonSize, OUTBOUND_PROTOCOL_LIMIT, VISIBLE_IMPORT_LIMIT };
