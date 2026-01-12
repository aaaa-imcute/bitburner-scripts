import { fixMainFunction } from "./ramlib.js";
/** @param {NS} ns */
async function maybeInstallBackdoor(ns, target, maxTime) {
  let s = await ns.getServer(target);
  let p = await ns.getPlayer();
  let h = ns.formulas.hacking;
  if (s.purchasedByPlayer) return false;
  if (s.backdoorInstalled) return true;
  if (s.requiredHackingSkill > p.skills.hacking) return false;
  if (h.hackTime(s, p) > 4 * maxTime) return false;
  await ns.singularity.installBackdoor(target);
  return true;
}
export async function main(ns) {
  ns.ramOverride(6.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    let q = ["home"], vis = new Set(), ret = new Map(), curr;
    ret.set("home", ["home"]);
    while (curr = q.pop()) {
      if (vis.has(curr)) continue;
      vis.add(curr);
      let stack = ret.get(curr);
      if ((await ns.getServer(curr)).backdoorInstalled) stack = [curr];
      for (let i of await ns.scan(curr)) {
        if (!ret.has(i)) ret.set(i, [...stack, i]);
        q.push(i);
      }
    }
    for (let i of ns.args.length ? ns.args : ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"]) {
      await ns.singularity.connect("home");
      for (let j of ret.get(i)) {
        await ns.singularity.connect(j);
        await maybeInstallBackdoor(ns, j, 2000);
      }
      if (await maybeInstallBackdoor(ns, i, 30000)) {
        ns.tprint("successfully installed backdoor on " + i);
      } else {
        ns.tprint("failed to install backdoor on " + i + " in a reasonable amount of time");
      }
    }
    await ns.singularity.connect("home");
  });