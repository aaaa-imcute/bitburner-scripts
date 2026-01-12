/** @param {NS} ns */
export async function main(ns) {
  if (ns.args[0] == "home") ns.exit();
  await ns.hack(ns.args[0], {
    threads: ns.args[2],
    additionalMsec: ns.args[1]
  });
  globalThis[ns.args[3]]?.();
}