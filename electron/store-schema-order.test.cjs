const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "store.cjs"), "utf8");

/**
 * The schema block runs before ensureColumn() adds missing columns. An index
 * created inside that block therefore has to reference a column that the same
 * block's CREATE TABLE already declares, or upgrading an existing workspace
 * fails with "no such column" and skips every later migration.
 */
function schemaBlock() {
  const start = source.indexOf("function schema(db)");
  assert.ok(start >= 0, "schema() is missing");
  const execStart = source.indexOf("db.exec(`", start);
  const execEnd = source.indexOf("`);", execStart);
  assert.ok(execStart >= 0 && execEnd > execStart, "the schema exec block is missing");
  return source.slice(execStart, execEnd);
}

function tableColumns(block) {
  const tables = new Map();
  for (const match of block.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\) STRICT;/g)) {
    const columns = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b/i.test(line))
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean);
    tables.set(match[1], columns);
  }
  return tables;
}

test("every index in the schema block only references columns it declares", () => {
  const block = schemaBlock();
  const tables = tableColumns(block);
  assert.ok(tables.size > 10, "expected the schema block to declare its tables");
  const violations = [];
  for (const match of block.matchAll(/CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]*)\)/g)) {
    const [, index, table, columns] = match;
    const declared = tables.get(table);
    if (!declared) { violations.push(`${index}: table ${table} is not created here`); continue; }
    for (const raw of columns.split(",")) {
      const column = raw.trim().split(/\s+/)[0];
      if (column && !declared.includes(column)) violations.push(`${index}: ${table}.${column}`);
    }
  }
  assert.deepEqual(violations, [], `indexes must move after ensureColumn(): ${violations.join(", ")}`);
});

test("the schema block never indexes a column that ensureColumn adds later", () => {
  // Those columns are missing on any workspace created before the migration,
  // so an index over them inside the block aborts the whole upgrade.
  const late = new Set();
  for (const match of source.matchAll(/ensureColumn\(db, "(\w+)", "(\w+)"/g)) late.add(`${match[1]}.${match[2]}`);
  assert.ok(late.size > 0, "expected ensureColumn migrations");
  const violations = [];
  for (const match of schemaBlock().matchAll(/CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]*)\)/g)) {
    const [, index, table, columns] = match;
    for (const raw of columns.split(",")) {
      const column = raw.trim().split(/\s+/)[0];
      if (column && late.has(`${table}.${column}`)) violations.push(`${index}: ${table}.${column}`);
    }
  }
  assert.deepEqual(violations, [], `move these indexes after ensureColumn(): ${violations.join(", ")}`);
});
