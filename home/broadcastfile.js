/** @param {NS} ns */
export async function main(ns) {
  let file = ns.args[0];
  let s = ns.read(file);
  if (s == "") ns.tprint("empty file " + ns.getHostname());
  ns.writePort(3, s);
}