/** @param {NS} ns */
export async function main(ns) {
  await ns.clearPort(1);
  await ns.writePort(1,ns.args[0]);
}