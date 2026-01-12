/** @param {NS} ns */
export async function main(ns) {
  let target, moneyThresh, securityThresh;
  while (true) {
    let k = await ns.peek(1);
    if(k!="keepRunning")exit();
    let p = await ns.peek(2);
    if (target != p) {
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