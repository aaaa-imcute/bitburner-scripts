/** @param {NS} ns */
export async function main(ns) {
  let target, moneyThresh, securityThresh;
  await ns.sleep(Math.random() * 10000);
  while (true) {
    let k = await ns.peek(1);
    if (k == "stopRunning") ns.exit();
    let p = ns.args[0];
    if (p && target != p && p != "NULL PORT DATA") {
      target = p;
      moneyThresh = ns.getServerMaxMoney(target);
      securityThresh = ns.getServerMinSecurityLevel(target);
    }
    if (ns.getServerSecurityLevel(target) > securityThresh) {
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}