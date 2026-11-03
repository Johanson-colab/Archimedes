async function runWindowAgent({ sender, native = false, run }) {
  if (sender.isDestroyed()) throw new Error("The Work window is closed.");
  const controller = native ? new AbortController() : null;
  const onDestroyed = () => controller?.abort();
  if (native) sender.once("destroyed", onDestroyed);
  try {
    return await run({ externalSignal: controller?.signal, emit: (payload) => {
      if (sender.isDestroyed()) { onDestroyed(); return; }
      try { sender.send("agent:event", payload); }
      catch (error) { onDestroyed(); if (!sender.isDestroyed()) throw error; }
    } });
  } finally {
    if (native) sender.removeListener("destroyed", onDestroyed);
  }
}

module.exports = { runWindowAgent };
