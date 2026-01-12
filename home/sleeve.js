import { fixMainFunction, asyncMap, asyncFilter } from "ramlib.js";
export async function main(ns) {
  ns.ramOverride(8.2);
}
main = fixMainFunction(
  /** @param {NS} ns */
  async function (ns) {
    while (1) {
      for (let i = 0; i < 8; i++) {
        let s = await ns.sleeve.getSleeve(i);
        let c = await ns.formulas.work.crimeSuccessChance(s, "Homicide");
        let j = await ns.sleeve.getTask(i);
        let k = (await ns.getPlayer()).numPeopleKilled;
        let plan = [];
        if (s.shock >= 98) plan = ["Shock Recovery", ns.sleeve.setToShockRecovery];
        else if (c <= 0.3) plan = ["Mug", ns.sleeve.setToCommitCrime];
        else if (k <= 30 || ns.heart.break() >= -54000) plan = ["Homicide", ns.sleeve.setToCommitCrime];
        else {
          let worst = Object.entries(ns.enums.GymType)
            .map(e => [e[1], s.skills[e[0]]])
            .reduce((e, f) => ((e[1] > f[1]) ? f : e), ["", Infinity])[0];
          plan = [worst, async (a, b) => {
            await ns.sleeve.travel(a, "Sector-12");
            await ns.sleeve.setToGymWorkout(a, "Powerhouse Gym", b);
          }];
        }
        if (j) {
          if (j.cyclesWorked > 5) continue;
          if (
            j.type == "SYNCHRO" && plan[0] == "Shock Recovery" ||
            j.type == "CRIME" && plan[0] == j.crimeType ||
            j.type == "CLASS" && plan[0] == j.classType
          ) continue;
        }
        await plan[1](i, plan[0]);
      }
      ns.clearLog();
      ns.print(ns.heart.break());
      await ns.sleep(50);
    }
  });