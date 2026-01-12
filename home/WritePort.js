/** @param {NS} ns */
export async function main(ns) {
  await ns.clearPort(ns.args[0]);
  await ns.writePort(ns.args[0], ns.args[1]);
}