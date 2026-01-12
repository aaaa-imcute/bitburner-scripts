/** @param {NS} ns */
export async function main(ns) {
  let ss = ns.args[0], sf = ns.args[1], ef = ns.args[2], rc, re, hn = ns.getHostname(), fn = "broadcastfile.js";
  if (ss == hn) {
    rc = re = ns.run(fn, 1, sf);
  } else {
    rc = ns.scp(fn, ss, "home");
    re = ns.exec(fn, ss, 1, sf);
  }
  if (!rc || !re) ns.tprint(`Unsuccessful file copying from ${sf}, ${ss} to ${ef}, ${hn}; error ${rc} ${re}`);
  else {
    await ns.nextPortWrite(3);
    ns.write(ef, ns.readPort(3), "w");
  }
}