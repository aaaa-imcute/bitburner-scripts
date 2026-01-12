const magicNumber = 511685319121658;//Math.floor(Math.random()*Number.MAX_SAFE_INTEGER)
const workerProgram = `/** @param {NS} ns */
export async function main(ns){
  let port = ns.pid + ${magicNumber};
  globalThis["ctx" + port] = ns;
  ns.getPortHandle(port).write("done");
}`;
const workerLocation = "worker/worker.js";
export class Fragment {
  constructor(fun, maxRam) {
    this.script = fun;
    this.maxRam = maxRam;
  }
  /** @param {NS} ns */
  async execute(ns) {
    if (this.maxRam) ns.ramOverride(ns.ramOverride() - this.maxRam - 1.6);
    ns.write(workerLocation, workerProgram, "w");
    let port = ns.run(workerLocation, 1) + magicNumber;
    if (port == magicNumber) throw "unable to create ns object";
    let handle = ns.getPortHandle(port);
    if (!handle.empty()) throw "your port situation is very weird";
    await handle.nextWrite();
    let ret = this.script(globalThis["ctx" + port]);
    handle.read();
    delete globalThis["ctx" + port];
    if (this.maxRam) ns.ramOverride(ns.ramOverride() + this.maxRam + 1.6);
    return ret;
  }
}