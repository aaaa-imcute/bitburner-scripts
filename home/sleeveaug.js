import { fixMainFunction, asyncMap, asyncFilter } from "./ramlib.js";
export async function main(ns) {
  ns.ramOverride(8.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    for (let i = 0; i < 8; i++) {
      let a = await ns.sleeve.getSleevePurchasableAugs(i);
      for (let j of a) {
        if (/*await ns.getServerMoneyAvailable("home")*/2e9 >= j.cost) {
          await ns.sleeve.purchaseSleeveAug(i, j.name);
        }
      }
    }
  });