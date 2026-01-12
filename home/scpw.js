/** @param {NS} ns */
export async function main(ns) {
  let ss = ns.args[0], sf = ns.args[1], es = ns.args[2], ef = ns.args[3],
  rc, re, hn = ns.getHostname(), fn = "scp.js";
  if (ss == hn) {
    rc = re = ns.run(fn, 1, ss, sf, ef);
  } else {
    rc = ns.scp(fn, es, "home");
    re = ns.exec(fn, es, 1, ss, sf, ef);
  }
  if (!rc || !re) ns.tprint(`Unsuccessful file copying from ${sf}, ${ss} to ${ef}, ${es}; error ${rc} ${re}`);
}