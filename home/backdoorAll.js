import { nukeServer } from "maxports.js";
/** @param {NS} ns */
async function backdoor(ns, server, parent) {
  let servers = ns.scan(server).filter(e => e != parent);
  for (let i of servers) {
    ns.singularity.connect(i);
    let s = ns.getServer(i);
    if (
      nukeServer(ns, i) &&
      !s.purchasedByPlayer &&
      i != "home" &&
      !s.backdoorInstalled &&
      s.requiredHackingSkill <= ns.getHackingLevel()
    ) {
      await ns.singularity.installBackdoor();
    }
    await backdoor(ns, i, server);
    ns.singularity.connect(server);
  }
}
/** @param {NS} ns */
export async function main(ns) {
  await backdoor(ns, "home", "home");
}