/** @param {NS} ns */
export async function main(ns) {
  while (true) {
    let k = await ns.peek(1);
    if (k == "stopRunning") ns.exit();
    await ns.share();
  }
}