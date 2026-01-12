import { getAllServers } from "scanlib.js"
/** @param {NS} ns */
export async function main(ns) {
  let s = getAllServers(ns);
  for (let i of s) {
    ns.killall(i, true);
  }
}