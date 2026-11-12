const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ssh = require("./ssh-servers.cjs");

function withSettings(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-ssh-"));
  // The real app encrypts with safeStorage; tests only need a reversible codec.
  ssh.initialize(root, {
    encrypt: (value) => `enc:${Buffer.from(value, "utf8").toString("base64")}`,
    decrypt: (value) => Buffer.from(String(value || "").replace(/^enc:/, ""), "base64").toString("utf8"),
  });
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("a server is saved, listed and readable again", () => {
  withSettings((root) => {
    const saved = ssh.saveServer({ name: "GPU box", host: "gpu01.example.com", user: "ubuntu", port: 2222, identityFile: "/Users/x/.ssh/id_ed25519" });
    assert.equal(saved.port, 2222);
    assert.deepEqual(ssh.listServers(), [saved]);

    // Stored on disk, not only in memory.
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, "ssh-servers.json"), "utf8"));
    assert.equal(onDisk.servers.length, 1);
    assert.equal(onDisk.servers[0].host, "gpu01.example.com");
  });
});

test("the saved file is private to the user", () => {
  withSettings((root) => {
    ssh.saveServer({ host: "h", user: "u" });
    const mode = fs.statSync(path.join(root, "ssh-servers.json")).mode & 0o777;
    assert.equal(mode, 0o600, "hosts and users are nobody else's business");
  });
});

test("host:port typing is understood", () => {
  withSettings(() => {
    const saved = ssh.saveServer({ host: "gpu01.example.com:2222", user: "ubuntu" });
    assert.equal(saved.host, "gpu01.example.com");
    assert.equal(saved.port, 2222);
  });
});

test("a server without a host or user is refused", () => {
  withSettings(() => {
    assert.throws(() => ssh.saveServer({ user: "u" }), /needs a host/);
    assert.throws(() => ssh.saveServer({ host: "h" }), /needs a user/);
  });
});

test("a host that ssh could not parse is refused", () => {
  withSettings(() => {
    assert.throws(() => ssh.saveServer({ host: "evil; rm -rf /", user: "u" }), /characters SSH will not accept/);
    assert.throws(() => ssh.saveServer({ host: "h", user: "u name" }), /user name is not valid/);
  });
});

test("the port has to be a real port", () => {
  withSettings(() => {
    assert.throws(() => ssh.saveServer({ host: "h", user: "u", port: 70_000 }), /between 1 and 65535/);
  });
});

test("an identity file must be an absolute path or start at ~", () => {
  withSettings(() => {
    assert.throws(() => ssh.saveServer({ host: "h", user: "u", identityFile: "id_ed25519" }), /absolute path/);
    assert.doesNotThrow(() => ssh.saveServer({ host: "h", user: "u", identityFile: "~/.ssh/id_ed25519" }));
  });
});

test("named-user home paths are rejected instead of pointing to the current user's home", () => {
  withSettings(() => {
    assert.throws(() => ssh.saveServer({ host: "h", user: "u", identityFile: "~other/.ssh/id_ed25519" }), /~user paths are not supported/);
  });
});

test("saving an existing id replaces it instead of adding a second copy", () => {
  withSettings(() => {
    const first = ssh.saveServer({ host: "h", user: "u", name: "before" });
    ssh.saveServer({ ...first, name: "after" });
    const servers = ssh.listServers();
    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, "after");
    assert.equal(servers[0].createdAt, first.createdAt, "the creation time is kept");
  });
});

test("deleting removes exactly one server", () => {
  withSettings(() => {
    const a = ssh.saveServer({ host: "a", user: "u" });
    ssh.saveServer({ host: "b", user: "u" });
    ssh.deleteServer(a.id);
    assert.deepEqual(ssh.listServers().map((server) => server.host), ["b"]);
    assert.throws(() => ssh.deleteServer(a.id), /does not exist/);
  });
});

test("the connection command is non-interactive and names the key", () => {
  const plain = ssh.connectionArgs({ user: "ubuntu", host: "gpu01", port: 22 }, "printf ok");
  assert.deepEqual(plain.slice(0, 6), ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new"]);
  assert.ok(plain.includes("-p") && plain.includes("22"));
  assert.equal(plain.at(-2), "ubuntu@gpu01");
  assert.equal(plain.at(-1), "printf ok");
  assert.ok(!plain.includes("-i"), "no key flag when none is configured");

  const withKey = ssh.connectionArgs({ user: "j", host: "h", port: 2222, identityFile: "/k" }, "printf ok");
  assert.deepEqual(withKey.slice(withKey.indexOf("-i"), withKey.indexOf("-i") + 2), ["-i", "/k"]);
  assert.equal(withKey.at(-2), "j@h");
});

test("a password is stored encrypted and never listed", () => {
  withSettings((root) => {
    const saved = ssh.saveServer({ host: "10.150.16.11", user: "ubuntu", password: "hunter2" });
    assert.equal(saved.hasPassword, true);
    assert.equal("password" in saved, false, "the plain password is never returned");

    const listed = ssh.listServers();
    assert.equal(listed[0].hasPassword, true);
    assert.equal(JSON.stringify(listed).includes("hunter2"), false);

    const raw = fs.readFileSync(path.join(root, "ssh-servers.json"), "utf8");
    assert.equal(raw.includes("hunter2"), false, "not on disk in the clear");
  });
});

test("leaving the password empty keeps the saved one, clearing it removes it", () => {
  withSettings(() => {
    const saved = ssh.saveServer({ host: "h", user: "u", password: "secret" });
    const kept = ssh.saveServer({ ...saved, name: "renamed" });
    assert.equal(kept.hasPassword, true, "editing other fields keeps the password");

    const cleared = ssh.saveServer({ ...saved, password: "" });
    assert.equal(cleared.hasPassword, false);
  });
});

test("a password makes the connection promptable instead of fail-fast", () => {
  const withoutPassword = ssh.connectionArgs({ user: "u", host: "h", port: 22 }, "printf ok");
  assert.ok(withoutPassword.includes("BatchMode=yes"));

  const withPassword = ssh.connectionArgs({ user: "u", host: "h", port: 22 }, "printf ok", { allowPassword: true });
  assert.ok(withPassword.includes("BatchMode=no"));
});

test("an identity path starting with ~ is expanded before ssh sees it", () => {
  const args = ssh.connectionArgs({ user: "u", host: "h", port: 22, identityFile: "~/.ssh/id_ed25519" }, "printf ok");
  const key = args[args.indexOf("-i") + 1];
  assert.ok(path.isAbsolute(key), "ssh has no shell to expand it");
  assert.equal(key, path.join(os.homedir(), ".ssh", "id_ed25519"));
  assert.equal(key.includes("~"), false);
});
