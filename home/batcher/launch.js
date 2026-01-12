/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(2.9);
  if (ns.args[0] == "home") ns.exit();
  globalThis[ns.args[0]].resolve(ns);
  await globalThis[ns.args[0]].promise;
}