/** @param {NS} ns */
export async function main(ns) {
  let vis = [];
  let methods = [ns.nuke, ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
  let queue = ["home"], i;
  let servers = [];
  while (i = queue.pop()) {
    if (vis.includes(i)) continue;
    vis.push(i);
    for (let j = 5; j >= 0; j--)methods[j](i);
    if (ns.hasRootAccess(i)) servers.push(i);
    queue.push(...ns.scan(i));
  }
  ns.tprint(`Found ${servers.length} usable servers`);
  for (let i of servers) {
    let files = ns.ls(i);
    for (let j of files) {
      if (ns.fileExists(j)) continue;
      ns.run("scpw.js", 1, i, j, "pserv-3", "crawler_" + i + "_" + j + ".txt");
      await ns.sleep(1000);
    }
  }
}