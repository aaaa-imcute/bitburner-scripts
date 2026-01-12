let vis = [];
/** @param {NS} ns */
async function s(ns, t, n) {
  for (let i of ns.scan(t)) {
    if (vis.includes(i)) continue;
    vis.push(i);
    //ns.tprint(n+i);
    await s(ns, i, n + " ");
  }
}
/** @param {NS} ns */
export async function main(ns) {
  vis = ["home"];
  await s(ns, "home", "");
  let goal = ns.getHackingLevel() / 2, ok = ns.args[0];
  vis = vis.filter(e => (ns.getServerRequiredHackingLevel(e) <= goal));
  vis = vis.filter(e => (ns.getServerNumPortsRequired(e) <= ok));
  vis = vis.map(e => [e, ns.getServerMaxMoney(e)/ns.getServerMinSecurityLevel(e)]);
  vis.sort((e, f) => f[1] - e[1]);
  ns.tprint(vis[0][0]);
}