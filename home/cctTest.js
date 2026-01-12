import { cctSolutions } from "cctSolutions.js"
/** @param {NS} ns */
export async function main(ns) {
  let t = "Sanitize Parentheses in Expression", time = performance.now();
  let times = 10000;
  for (let i = 0; i < times; i++) {
    let c = ns.codingcontract.createDummyContract(t);
    let n = ns.codingcontract.getData(c);
    let ans = cctSolutions[t](n);
    let k = ns.codingcontract.attempt(ans, c);
    if (!k) {
      throw "bad";
    }
  }
  throw `you took ${((performance.now() - time) / times * 1000).toPrecision(4)} microseconds`;
}