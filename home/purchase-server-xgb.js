/** @param {NS} ns */
export async function main(ns) {
  let ram = ns.args[0];
  if (ram == "max") ram = ns.getPurchasedServerMaxRam();
  ns.tprint(ram);
  let i = 0;
  while (i < ns.getPurchasedServerLimit()) {
    let m = ns.getServerMoneyAvailable("home"), s = "pserv-" + i;
    if (ns.serverExists(s)) {
      if (ns.getServerMaxRam(s) >= ram) {
        ns.tprint(s + " already has enough ram");
        i++;
      }
      else if (m > ns.getPurchasedServerUpgradeCost(s, ram)) {
        ns.tprint("Upgrading " + s);
        ns.upgradePurchasedServer(s, ram);
        i++;
      }
    } else if (m > ns.getPurchasedServerCost(ram)) {
      ns.tprint("Buying " + s);
      ns.purchaseServer(s, ram);
      ++i;
    }
    await ns.sleep(100);
  }
}