/** @param {NS} ns */
export async function main(ns) {
  //undoes init() in smarthacking.js
  let target = ns.args[0];
  while (ns.getServerMoneyAvailable(target) > 1) {
    await ns.hack(target);
  }
  ns.tprint(target + " broken");
  
}