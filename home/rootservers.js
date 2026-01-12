/** @param {NS} ns */
let vis = [], servers = [], methods = [], payload, okPorts;
async function s(ns, t, n) {
  for (let i of ns.scan(t)) {
    if (vis.includes(i)) continue;
    vis.push(i);
    //ns.tprint(n+i);
    await s(ns, i, n + " ");
  }
}
function removeTwoTerms([first,second,...rest]){
  return rest;
}
export async function main(ns) {
  vis = ["home"];
  servers = [[], [], [], [], [], []];
  methods = [ns.nuke, ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
  payload = ns.args[1];
  okPorts = ns.args[0];
  await s(ns, "home", "");
  for (let i of vis) {
    let p = await ns.getServerNumPortsRequired(i);
    if (await ns.hasRootAccess(i)) p = 0;
    servers[p].push(i);
  }
  for (let i = okPorts; i >= 0; i--) {
    for (let j of servers[i]) {
      await methods[i](j);
    }
    if (i != 0) servers[i - 1].push(...servers[i]);
  }
  for (let i of servers[0]) {
    ns.tprint(i);
    ns.scp(payload, i);
    let r = ns.getServerMaxRam(i) - ns.getServerUsedRam(i);
    let c = ns.getScriptRam(payload, i);
    if (r / c >= 1) ns.exec(payload, i, Math.floor(r / c),...removeTwoTerms(ns.args));
  }
}