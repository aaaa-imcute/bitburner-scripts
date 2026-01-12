import { cctSolutions } from "cctSolutions.js"
import { getAllServers } from "scanlib.js"
/** @param {NS} ns */
export async function main(ns) {
  let servers = getAllServers(ns);
  for (let i of servers) {
    let contracts = ns.ls(i).filter(e => e.endsWith(".cct"));
    for (let j of contracts) {
      let t = ns.codingcontract.getContractType(j, i);
      let fun = cctSolutions[t];
      let n = ns.codingcontract.getData(j, i);
      if (!fun) continue;
      let ans = fun(n);
      let k = ns.codingcontract.attempt(ans, j, i);
      if (k) {
        ns.tprint(`${t} on ${i} (${j}) solved correctly, reward ${k}`);
      } else {
        debugger;
        throw "bad";
      }
    }
  }
}