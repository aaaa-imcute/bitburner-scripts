/** @param {NS} ns */
export function getAllServers(ns) {
  let helper = e => [e, ...ns.scan(e).slice(e != "home").flatMap(helper)];
  return helper("home");
}