import { fixMainFunction, asyncMap, asyncFilter } from "ramlib.js";
function objectDeepEquals(a, b) {
  if (typeof a != "object" || typeof b != "object") return a === b;
  for (let i of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!objectDeepEquals(b[i], a[i])) return false;
  }
  return true;
}
function calculateAscensionThreshold(minfo) {
  return 1.66 - 0.62 / Math.exp((2 / minfo.str_asc_mult) ** 2.24);
}
function calculateWantedFactorGain(g, r, w) {
  return (g.respect + r) / (g.respect + r + Math.max(1, g.wantedLevel + w)) -
    g.respect / (g.respect + g.wantedLevel)
}
function scoreTask(g, r, m, f, makeMoney) {
  return (1 + f / (g.respect / (g.respect + g.wantedLevel))) * (1 + r / g.respect);
}
export async function main(ns) {
  ns.ramOverride(8.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    let makeMoney = !!ns.args[0];
    let clashCycle = [-Infinity, Infinity], clashInterval = 100, cycles = 0;
    while (1) {
      if ((await ns.gang.getGangInformation()).respect >= await ns.gang.respectForNextRecruit()) {
        let i = 0, name;
        while ((await ns.gang.getMemberNames()).includes(name = "member " + i)) i++;
        await ns.gang.recruitMember(name);
      }
      for (let i of await ns.gang.getMemberNames()) {
        if (
          (await ns.gang.getAscensionResult(i))?.str >=
          calculateAscensionThreshold(await ns.gang.getMemberInformation(i))) {
          await ns.gang.ascendMember(i);
        }
      }
      let deltaTime = Math.round(Math.max(2000, Math.min(5000, await ns.gang.getBonusTime())) / 200);
      let atWar = Number.isFinite(clashCycle[0]) &&
        Math.max(cycles, clashCycle[0]) < Math.min(cycles + deltaTime, clashCycle[1]);
      await ns.gang.setTerritoryWarfare(
        atWar && (await asyncFilter(
          Object.keys(await ns.gang.getOtherGangInformation()),
          async e =>
            e != (await ns.gang.getGangInformation()).faction &&
            await ns.gang.getChanceToWinClash(e) < 0.55
        )).length == 0
      );
      let tasks = await ns.gang.getTaskNames();
      let info = await ns.gang.getGangInformation();
      let equipment = await ns.gang.getEquipmentNames();
      for (let i of await ns.gang.getMemberNames()) {
        if (atWar) {
          await ns.gang.setMemberTask(i, "Territory Warfare");
          continue;
        }
        let minfo = await ns.gang.getMemberInformation(i);
        for (let j of equipment) {
          let cost = await ns.gang.getEquipmentCost(j);
          let money = await ns.getServerMoneyAvailable("home");
          if ((await ns.gang.getEquipmentType(j)) == "Augmentation") {
            if (cost <= money / 10) await ns.gang.purchaseEquipment(i, j);
          } else {
            if (cost <= money / 100) await ns.gang.purchaseEquipment(i, j);//something about makeMoney?
          }
        }
        let m = -Infinity, best;
        for (let j of tasks) {
          let stats = await ns.gang.getTaskStats(j);
          let respect = await ns.formulas.gang.respectGain(info, minfo, stats);
          let money = await ns.formulas.gang.moneyGain(info, minfo, stats);
          let wanted = await ns.formulas.gang.wantedLevelGain(info, minfo, stats);
          let factor = calculateWantedFactorGain(info, respect, wanted);
          let score = scoreTask(info, respect, money, factor, makeMoney);
          if (score > m) {
            m = score;
            best = j;
          }
        }
        if (best == "Unassigned") best = "Train Combat";
        await ns.gang.setMemberTask(i, best);
      }
      let oldTerritory = await ns.gang.getOtherGangInformation();
      let actualDT = Math.round((await ns.gang.nextUpdate()) / 200);
      if (deltaTime != actualDT) await ns.toast("lag spike");
      let newTerritory = await ns.gang.getOtherGangInformation();
      if (!objectDeepEquals(oldTerritory, newTerritory)) {
        clashCycle = [
          Math.max(clashCycle[0], cycles) + clashInterval,
          Math.min(clashCycle[1], cycles + actualDT) + clashInterval
        ];
        if (clashCycle[0] >= clashCycle[1]) throw "very bad interval math";
      }
      cycles += actualDT;
    }
  }, 4);