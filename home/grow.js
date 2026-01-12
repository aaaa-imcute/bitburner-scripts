/** @param {NS} ns */
export async function main(ns) {
  if (ns.args[0] == "test") ns.exit();
  await ns.grow(ns.args[0], {
    threads: ns.args[2],
    additionalMsec: ns.args[1]
  });
}