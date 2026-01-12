import { fixMainFunction } from "./ramlib.js"
export function main(ns) {
  ns.ramOverride(9.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    let a = "NeuroFlux Governor";
    let fs = (await ns.getPlayer()).factions;
    let need = 150 * (await ns.getBitNodeMultipliers()).RepToDonateToFaction;
    let f = (await Promise.all((await ns.singularity.getAugmentationFactions(a))
      .filter(e => fs.includes(e))
      .map(async e => [e,
        await ns.singularity.getFactionRep(e) +
        (await ns.singularity.getFactionFavor(e) > need) * 1e20
      ])))
      .reduce((e, f) => (e[1] > f[1]) ? e : f)[0];
    while (await ns.getServerMoneyAvailable("home") > await ns.singularity.getAugmentationPrice(a)) {
      if (await ns.singularity.getFactionFavor(f) >= need) {
        let donation = ns.formulas.reputation.donationForRep(
          Math.max(
            await ns.singularity.getAugmentationRepReq("NeuroFlux Governor") -
            await ns.singularity.getFactionRep(f),
            0
          )
          , await ns.getPlayer()
        );
        debugger;
        await ns.singularity.donateToFaction(f, donation);
      }
      if (!await ns.singularity.purchaseAugmentation(f, a)) ns.exit();
      await ns.sleep(100);
    }
  }, 5);