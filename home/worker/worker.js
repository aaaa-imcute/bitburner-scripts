/** @param {NS} ns */
export async function main(ns){
  let port = ns.pid + 5537569121658;
  globalThis["ctx" + port] = ns;
  ns.getPortHandle(port).write("done");
}