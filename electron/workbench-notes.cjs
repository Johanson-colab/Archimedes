const fs = require("node:fs");
const path = require("node:path");

const NOTES_FILE = "workbench-notes.json";
const MAX_KEY_LENGTH = 240;
const MAX_CONTENT_LENGTH = 1_000_000;

let notesPath = "";
let notes = {};

function normalizeKey(key) {
  const value = String(key ?? "").trim().slice(0, MAX_KEY_LENGTH);
  if (!value) throw new Error("A note key is required.");
  return value;
}

function initialize(userDataPath) {
  notesPath = path.join(userDataPath, NOTES_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(notesPath, "utf8"));
    notes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    notes = {};
  }
  return {};
}

function persist() {
  if (!notesPath) return;
  fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  fs.writeFileSync(notesPath, `${JSON.stringify(notes, null, 2)}\n`, "utf8");
}

function getNote(key) {
  const entry = notes[normalizeKey(key)];
  return {
    content: typeof entry?.content === "string" ? entry.content : "",
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : null,
  };
}

function saveNote(key, content) {
  const normalizedKey = normalizeKey(key);
  const text = String(content ?? "").slice(0, MAX_CONTENT_LENGTH);
  if (!text.trim()) {
    delete notes[normalizedKey];
    persist();
    return { content: "", updatedAt: null };
  }
  const updatedAt = new Date().toISOString();
  notes[normalizedKey] = { content: text, updatedAt };
  persist();
  return { content: text, updatedAt };
}

function deleteNote(key) {
  const normalizedKey = normalizeKey(key);
  const deleted = Boolean(notes[normalizedKey]);
  if (deleted) {
    delete notes[normalizedKey];
    persist();
  }
  return { deleted };
}

module.exports = {
  initialize,
  getNote,
  saveNote,
  deleteNote,
};
