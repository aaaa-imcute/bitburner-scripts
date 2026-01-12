import { portMethods } from "maxports.js"

/** @param {NS} ns */
export async function main(ns) {
  if (!ns.singularity.purchaseTor()) {
    ns.tprint("can't buy router");
    ns.exit();
  }
  for (let i of portMethods) {
    if (!ns.singularity.purchaseProgram(i + ".exe")) {
      ns.tprint("can't buy " + i);
      ns.exit();
    };
  }
}