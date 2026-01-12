import { fixMainFunction } from "ramlib.js"
export function main(ns){
  ns.ramOverride(2.6);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    ns.toast(ns.heart.break());
    ns.tprint(await ns.gang.getOtherGangInformation());
  }
);