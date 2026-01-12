/** @param {NS} ns */
export async function main(ns) {
  ns.exec(ns.args[0], ns.args[1], JSON.parse(ns.args[2]), ...ns.args.slice(3))
}