export const portMethods = ["brutessh", "ftpcrack", "relaysmtp", "httpworm", "sqlinject"];
/** @param {NS} ns */
export function maxPorts(ns) {
  for (let i = portMethods.length - 1; i >= 0; i--) {
    if (ns.fileExists(portMethods[i] + ".exe")) {
      return i + 1;
    }
  }
  return 0;
}
/** @param {NS} ns */
export function nukeServer(ns, host) {
  if (ns.hasRootAccess(host)) return true;
  if (ns.getServerNumPortsRequired(host) > maxPorts(ns)) return false;
  //not using ns["nuke"] etc to not underestimate ram allocation
  const realMethods = [ns.nuke, ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
  for (let i = maxPorts(ns); i >= 0; i--) {
    if (!realMethods[i](host)) return false;
  }
  return true;
}