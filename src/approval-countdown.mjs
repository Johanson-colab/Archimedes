export function startApprovalCountdown(onTick, onComplete, clock = {
  now: () => performance.now(),
  setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
  clearInterval: id => window.clearInterval(id),
}) {
  const deadline = clock.now() + 10_000;
  let active = true;
  onTick(10);
  const timer = clock.setInterval(() => {
    if (!active) return;
    const remaining = Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
    onTick(remaining);
    if (remaining === 0) {
      active = false;
      clock.clearInterval(timer);
      onComplete();
    }
  }, 200);
  return () => { active = false; clock.clearInterval(timer); };
}
