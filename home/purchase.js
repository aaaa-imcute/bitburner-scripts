/** @param {NS} ns */
export async function main(ns) {
  for (let ram = 4; ram <= ns.getPurchasedServerMaxRam(); ram *= 2) {
    for (let i = 0; i < ns.getPurchasedServerLimit(); i++) {
      let m = ns.getServerMoneyAvailable("home"), s = "pserv-" + i;
      m-=10000000;
      if (ns.serverExists(s)) {
        if (ns.getServerMaxRam(s) >= ram) continue;
        else if (m > ns.getPurchasedServerUpgradeCost(s, ram)) {
          ns.upgradePurchasedServer(s, ram);
        }
      } else if (m > ns.getPurchasedServerCost(ram)) {
        ns.purchaseServer(s, ram);
      } else {
        break;
      }
    }
  }
}