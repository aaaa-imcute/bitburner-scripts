import { getAllServers } from "scanlib.js";
import { nukeServer } from "maxports.js";
export class Dispatcher {
  servers = [];
  /** @param {NS} ns */
  constructor(ns) {
    this.ns = ns;
    for (let i of getAllServers(ns)) {
      if (nukeServer(ns, i)) this.servers.push(i);
    }
    if (!this.servers.map(e => ns.hasRootAccess(e)).reduce((e, f) => e && f, true)) {
      throw "Something is very wrong";
    }
  }
  canDispatch(payloads, verbose = false) {//script threads ...args
    let used = {}, ret = [];
    for (let i of payloads) {
      let ramCost = this.ns.getScriptRam(i[0]) * i[1], min = Infinity, mins;
      for (let j of this.servers) {
        let rem = this.ns.getServerMaxRam(j) - this.ns.getServerUsedRam(j);
        if (used[j]) rem -= used[j];
        if (rem > ramCost && rem < min) {
          min = rem;
          mins = j;
        }
      }
      if (min == Infinity) return false;
      ret.push(mins);
      if (!used[mins]) used[mins] = 0;
      used[mins] += min;
    }
    if (verbose) return ret;
    return true;
  }
  dispatch(payloads) {
    let method = this.canDispatch(payloads, true);
    if (!method) return method;//side effect:returns false when payloads is empty
    let p = [];
    for (let i = 0; i < payloads.length; i++) {
      if (!this.ns.scp(payloads[i][0], method[i])) return false;
      let f = this.ns.exec(payloads[i][0], method[i], ...payloads[i].slice(1));
      if (!f) {
        p.forEach(e => this.ns.kill(e));
        return false;
      }
      p.push(f);
    }
    return true;//hopefully the scripts *are* actually dispatched
  }
  // async compile(payloads) {//script name only
  //   for (let i of payloads) {
  //     let ramCost = this.ns.getScriptRam(i);
  //     for (let j of this.servers) {
  //       let rem = this.ns.getServerMaxRam(j) - this.ns.getServerUsedRam(j);
  //       if (rem > ramCost) {
  //         this.ns.scp(i, j);
  //         this.ns.exec(i, j, 1, "test");//hopefully that script stops itsself
  //       }
  //     }
  //   }
  // }
}