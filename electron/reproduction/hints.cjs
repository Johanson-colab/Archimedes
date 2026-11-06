/**
 * Environment hints.
 *
 * The executor is an agent: it reads an error and decides what to try. These
 * are short, evidence-backed nudges attached to the observation it is about to
 * see. Nothing here changes a command, a verdict, or a runbook step on its own -
 * a hint is advice, not a repair.
 */

const MAX_HINTS = 3;

const INTERPRETER_NAMES = { python: "python3", pip: "pip3", python2: "python3" };

const RULES = [
  {
    // "bash: line 1: python: command not found"
    match: /(?:^|[\s:])([a-z0-9_.-]+): (?:command )?not found$/im,
    hint: (match) => {
      const name = match[1];
      const replacement = INTERPRETER_NAMES[name];
      return replacement
        ? `\`${name}\` is not installed under that name on this machine; \`${replacement}\` is the usual name on Ubuntu. Try \`${replacement}\` before anything else.`
        : `\`${name}\` is not on PATH. Check whether another tool in the repository provides it, or whether it needs installing.`;
    },
  },
  {
    match: /not a trusted or secure host/i,
    hint: () => "pip ignores a plain-http package index unless the host is trusted. The warning names the flag: `--trusted-host <host>`.",
  },
  {
    match: /HTTPConnectionPool\(host='(?:127\.0\.0\.1|localhost)'/i,
    hint: () => "A local proxy is receiving this request and timing out. If the host is on the intranet, bypass the proxy for this command (pip: `--proxy \"\"`) instead of changing the package.",
  },
  {
    match: /No module named ['"]?([A-Za-z0-9_.]+)['"]?/,
    hint: (match) => `The module \`${match[1]}\` is not importable. The environment step probably did not install the extra that provides it.`,
  },
  {
    match: /ResolutionImpossible|conflicting dependencies|Cannot install .* because these package versions have conflicting dependencies/i,
    hint: () => "Two pins disagree. Find which one the repository actually needs (lockfile, CI, Dockerfile), or relax one of them. `pip install --dry-run` shows the conflict without touching the environment.",
  },
  {
    match: /Failed building wheel|Could not build wheels|error: command ['"](?:gcc|g\+\+|cc)['"] failed/i,
    hint: () => "A build dependency is missing (compiler or Python headers), or the source does not compile against this Python. Check whether a wheel exists for this version before installing a toolchain.",
  },
  {
    match: /undefined symbol|libcudart|libtorch|CUDA driver version is insufficient|compiled against a different version/i,
    hint: () => "ABI mismatch. torch, torchvision and the CUDA build have to come from one consistent set; reinstalling one of them alone usually moves the error rather than fixing it.",
  },
  {
    match: /UnsatisfiableError|PackagesNotFoundError|Solving environment: failed/i,
    hint: () => "The conda solver cannot satisfy the pins. Fewer pinned packages, or pip/uv inside the environment, is usually faster than fighting the solver.",
  },
  {
    match: /requires-python|Requires-Python|is not supported on this platform/i,
    hint: () => "This is a hard constraint of the package (Python version or platform), not a mirror problem. Changing the interpreter or the package version is the real choice.",
  },
  {
    match: /CUDA out of memory|OutOfMemoryError|torch\.cuda\.OutOfMemory/i,
    hint: () => "This is GPU memory, not a code error. A smaller batch or a smaller model is the usual answer; retrying the same command will fail the same way.",
  },
  {
    match: /NoCredentialsError|Unable to locate credentials|InvalidClientTokenId|AccessDenied|401 Unauthorized|403 Forbidden|authentication failed/i,
    hint: () => "Credentials. A machine cannot register an account or obtain a key for you; this is the point to ask a person.",
  },
  {
    match: /No space left on device|ENOSPC/i,
    hint: () => "The disk is full. Freeing space is a person's decision unless a cache under the working directory can be cleared.",
  },
  {
    match: /Could not find a version that satisfies the requirement (\S+)/i,
    hint: (match) => `No candidate for \`${match[1]}\`. Separate the three causes: the index (URL, trusted-host, proxy), the Python version, and whether a wheel exists for this platform. \`pip index versions ${match[1]}\` answers the first and third.`,
  },
  {
    match: /Killed|signal: killed/i,
    hint: () => "The process was killed, usually by the out-of-memory killer. Check `dmesg` or reduce what the command loads.",
  },
];

function hintsFor(output) {
  const text = String(output || "");
  if (!text.trim()) return [];
  const hints = [];
  for (const rule of RULES) {
    const match = text.match(rule.match);
    if (match) hints.push(rule.hint(match));
    if (hints.length >= MAX_HINTS) break;
  }
  return hints;
}

module.exports = { MAX_HINTS, hintsFor };
