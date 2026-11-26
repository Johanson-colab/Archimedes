const fs = require("node:fs");
const path = require("node:path");
const { writeTextFileAtomically } = require("./atomic-text-file.cjs");

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

function persist(next) {
  if (notesPath) {
    const target = fs.lstatSync(notesPath, { throwIfNoEntry: false }) ? fs.realpathSync(notesPath) : notesPath;
    writeTextFileAtomically(target, `${JSON.stringify(next, null, 2)}\n`);
  }
  notes = next;
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
  const next = { ...notes };
  if (!text.trim()) {
    delete next[normalizedKey];
    persist(next);
    return { content: "", updatedAt: null };
  }
  const updatedAt = new Date().toISOString();
  next[normalizedKey] = { content: text, updatedAt };
  persist(next);
  return { content: text, updatedAt };
}

function deleteNote(key) {
  const normalizedKey = normalizeKey(key);
  const deleted = Boolean(notes[normalizedKey]);
  if (deleted) {
    const next = { ...notes };
    delete next[normalizedKey];
    persist(next);
  }
  return { deleted };
}

module.exports = {
  initialize,
  getNote,
  saveNote,
  deleteNote,
};
