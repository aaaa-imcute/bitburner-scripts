import { fixMainFunction, asyncMap, asyncFilter } from "ramlib.js"
export function main(ns) {
  ns.ramOverride(9.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    let factions = Object.values(ns.enums.FactionName);
    let augs = Object.fromEntries(await asyncMap(
      factions,
      async e => [e, await ns.singularity.getAugmentationsFromFaction(e)]
    ));
    let conds = Object.fromEntries(await asyncMap(
      factions,
      async e => [e, await ns.singularity.getFactionInviteRequirements(e)]
    ));
    let reps = Object.fromEntries(await asyncMap(
      [...new Set(Object.values(augs).flat())],
      async e => [e, await ns.singularity.getAugmentationRepReq(e)]
    ));
    let hf = factions.filter(e => !conds[e].filter(e => e.type != "backdoorInstalled").length);
    console.log();
    let target=hf.map(e => augs[e]).flat();
    let ret=Object.fromEntries(hf.map(e => augs[e].map(f => [f, reps[f]])));
    
  }, 5);