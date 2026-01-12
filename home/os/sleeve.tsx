import { dynamicExport, NSLike } from "./os.tsx";

//https://github.com/bitburner-official/bitburner-src/pull/2165
// type testType = Omit<typeof BladeburnerSkillName, "BladesIntuition" | "Cloak" | "ShortCircuit">;
// let typeLiteral: {
//   -readonly [key in keyof testType]: `${testType[key]}`;
// };
const _BladeburnerActionType: typeof BladeburnerActionType = {
  General: "General",
  Contract: "Contracts",
  Operation: "Operations",
  BlackOp: "Black Operations"
} as typeof BladeburnerActionType;
const _BladeburnerGeneralActionName: typeof BladeburnerGeneralActionName = {
  Training: "Training",
  FieldAnalysis: "Field Analysis",
  Recruitment: "Recruitment",
  Diplomacy: "Diplomacy",
  HyperbolicRegen: "Hyperbolic Regeneration Chamber",
  InciteViolence: "Incite Violence"
} as typeof BladeburnerGeneralActionName;
const _BladeburnerOperationName: typeof BladeburnerOperationName = {
  Investigation: "Investigation",
  Undercover: "Undercover Operation",
  Sting: "Sting Operation",
  Raid: "Raid",
  StealthRetirement: "Stealth Retirement Operation",
  Assassination: "Assassination"
} as typeof BladeburnerOperationName;
const _SpecialBladeburnerActionTypeForSleeve: typeof SpecialBladeburnerActionTypeForSleeve = {
  InfiltrateSynthoids: "Infiltrate Synthoids",
  SupportMainSleeve: "Support main sleeve",
  TakeOnContracts: "Take on contracts"
} as typeof SpecialBladeburnerActionTypeForSleeve;
interface Report {
  gang: {
    state: "waiting" | "making money" | "making reputation";
    members: number;
    territoryClashCycleUncertainty: number;
    territory: string;
    shouldEngageInTerritoryClashes: boolean;
    wantedFactor: string;
    wantedFactorRate: string;
  };
  sleeves: {
    averageShock: number;
    karma: string;
    numberOfPeopleKilled: number;
    //maybe also show what each sleeve is doing?
  };
};
function makeBlankReport(enums: NSEnums): Report {
  return {
    gang: {
      state: "waiting",
      members: 0,
      territoryClashCycleUncertainty: 100,
      territory: "14.29%",
      shouldEngageInTerritoryClashes: false,
      wantedFactor: "50%",
      wantedFactorRate: "0%"
    },
    sleeves: {
      averageShock: 100,
      karma: "0",
      numberOfPeopleKilled: 0
    }
  };
}
function typeCorrectEntries<T extends Object>(obj: T): Array<[keyof T, T[keyof T]]> {
  //ts isn't smart enough to figure out you can use the first item
  //of an item of the result of Object.entries of an object to index that object
  return Object.entries(obj) as any;
}
function territoryChanged(
  a: Record<string, GangOtherInfoObject>,
  b: Record<string, GangOtherInfoObject>
) {
  for (let [k, v] of typeCorrectEntries(a)) {
    let w = b[k];
    if (!w) throw new Error("this should never happen");
    if (v.power != w.power) return true;
    if (v.territory != w.territory) return true;
  }
  return false;
}
function calculateAscensionThreshold(minfo: GangMemberInfo) {
  return 1.66 - 0.62 / Math.exp((2 / minfo.str_asc_mult) ** 2.24);
}
function calculateWantedFactorGainRate(info: GangGenInfo, respect: number, wanted: number) {
  //wanted penalty factor=respect/(respect+wanted)
  //f'=((r+w)r'-r(r'+w'))/(r+w)^2=(wr'-rw')/(r+w)^2
  return (info.wantedLevel * respect - info.respect * wanted) / (info.respect + info.wantedLevel) ** 2;
}
const gangName = "Slum Snakes";
async function manageGang(ns: NSLike, report: Report) {
  let clashInterval = 100, clashCycle = [0, clashInterval], cycles = 0;
  while (1) {
    let info = await ns.gang.getGangInformation();
    //recruit new members
    if (info.respect >= await ns.gang.respectForNextRecruit()) {
      let i = 0, name;
      while ((await ns.gang.getMemberNames()).includes(name = "member " + i)) i++;
      await ns.gang.recruitMember(name);
    }
    report.gang.members = (await ns.gang.getMemberNames()).length;
    //ascend members
    for (let i of await ns.gang.getMemberNames()) {
      let res = await ns.gang.getAscensionResult(i);
      let minfo = await ns.gang.getMemberInformation(i);
      if (
        res && res.str >= calculateAscensionThreshold(minfo) &&
        minfo.earnedRespect / info.respect <= 0.2
      ) await ns.gang.ascendMember(i);
    }
    //some territory clash related stuff
    info = await ns.gang.getGangInformation();
    let deltaTime = Math.round(Math.max(2000, Math.min(5000, await ns.gang.getBonusTime())) / 200);
    let atWar =
      Math.max(cycles, clashCycle[0]) <
      Math.min(cycles + deltaTime, clashCycle[1]) &&
      info.territory < 1;
    let canFight = true;
    for (let [name, data] of typeCorrectEntries(await ns.gang.getOtherGangInformation())) {
      if (name == gangName) continue;
      let chance = await ns.gang.getChanceToWinClash(name);
      if (chance < 0.55) canFight = false;
    }
    await ns.gang.setTerritoryWarfare(canFight);
    report.gang.shouldEngageInTerritoryClashes = canFight;
    //deduce if we should be making money
    let makeMoney: boolean;
    let allAugs = await ns.singularity.getAugmentationsFromFaction(gangName);
    let ownedAugs = (await ns.getResetInfo()).ownedAugs;
    let augs: AugmentPair[] = [];//there's a type for this exact thing,how convenient
    let currentMoney = await ns.getServerMoneyAvailable("home");
    let currentRep = await ns.singularity.getFactionRep(gangName);
    for (let i of allAugs) {
      if (ownedAugs.has(i)) continue;
      let price = await ns.singularity.getAugmentationPrice(i);
      let rep = await ns.singularity.getAugmentationRepReq(i);
      if (price <= currentMoney && rep <= currentRep) continue;
      augs.push({ cost: price, name: i });
    }
    if (!augs.length) makeMoney = true;
    else {
      augs.sort((a, b) => a.cost - b.cost);
      makeMoney = augs[0].cost > currentMoney;
    }
    report.gang.state = makeMoney ? "making money" : "making reputation";
    //process members
    let tasks = ns.gang.getTaskNames();
    let equipment = ns.gang.getEquipmentNames();
    for (let i of await ns.gang.getMemberNames()) {
      let minfo = await ns.gang.getMemberInformation(i);
      //buy equipment if it would barely cause a dent in our budget
      //compared to its lifetime(augs don't reset)
      for (let j of equipment) {
        let cost = await ns.gang.getEquipmentCost(j);
        let money = await ns.getServerMoneyAvailable("home");
        let costFactor = (await ns.gang.getEquipmentType(j)) == "Augmentation" ? 10 : 100;
        if (cost <= money / costFactor) await ns.gang.purchaseEquipment(i, j);
      }
      //assign tasks
      if (atWar) await ns.gang.setMemberTask(i, "Territory Warfare");
      else {
        //decide which task is best
        let m = -Infinity, best: string | undefined;
        for (let j of tasks) {
          let stats = await ns.gang.getTaskStats(j);
          let respect = await ns.formulas.gang.respectGain(info, minfo, stats);
          let money = await ns.formulas.gang.moneyGain(info, minfo, stats);
          let wanted = await ns.formulas.gang.wantedLevelGain(info, minfo, stats);
          // let wantedScore =
          //   calculateWantedFactorGainRate(
          //     info,
          //     info.respectGainRate + respect,
          //     info.wantedLevelGainRate + wanted
          //   ) -
          //   calculateWantedFactorGainRate(info, info.respectGainRate, info.wantedLevelGainRate);
          let wantedScore = respect / (respect + wanted);//asymptote
          let objectiveScore = makeMoney ? money : respect;
          //let score = 2 * Math.log(wantedScore) + Math.log(objectiveScore);
          let score = wantedScore * objectiveScore;
          if (score > m) {
            m = score;
            best = j;
          }
        }
        if (!best || best == "Unassigned") best = "Train Combat";
        await ns.gang.setMemberTask(i, best);
      }
    }
    report.gang.wantedFactor = (info.wantedPenalty * 100).toPrecision(4) + "%";
    report.gang.wantedFactorRate = (calculateWantedFactorGainRate(
      info,
      info.respectGainRate,
      info.wantedLevelGainRate
    ) * 100).toPrecision(4) + "%";
    //deduce territory clash time
    let oldTerritory = await ns.gang.getOtherGangInformation();
    let actualDT = Math.round((await ns.gang.nextUpdate()) / 200);
    //await ns.asleep(0);
    if (deltaTime != actualDT) ns.toast("Lag spike detected", "warning");
    let newTerritory = await ns.gang.getOtherGangInformation();//concurrency issue
    if (territoryChanged(oldTerritory, newTerritory)) {
      while (cycles >= clashCycle[1]) {
        //we did not manage to detect the last clash
        ns.toast("failed to detect territory clash", "error")
        clashCycle[0] += clashInterval;
        clashCycle[1] += clashInterval;
      }
      clashCycle = [
        Math.max(clashCycle[0], cycles) + clashInterval,
        Math.min(clashCycle[1], cycles + actualDT) + clashInterval
      ];
      report.gang.territoryClashCycleUncertainty = clashCycle[1] - clashCycle[0];
      report.gang.territory = (newTerritory[gangName].territory * 100).toPrecision(4) + "%";
      if (clashCycle[0] >= clashCycle[1]) {
        //throw "very bad interval math " + clashCycle.join(" ");
        ns.toast("interval math error;resetting...", "error");
        clashCycle = [cycles, cycles + 100];
      }
    }
    cycles += actualDT;
  }
}
type SleeveCoordination = {
  infil: boolean,
  bbIndex: number,
}
async function manageSleeve(ns: NSLike, i: number, coord: SleeveCoordination) {
  while (1) {
    let s = await ns.sleeve.getSleeve(i);
    let j = await ns.sleeve.getTask(i);
    //priorities:
    //do crimes if possible and (needed or not in bb)
    //do bladeburner tasks if possible
    //get rid of shock if needed
    let shocked = s.shock >= 98;
    let needCrime = (await ns.getPlayer()).numPeopleKilled <= 30 || ns.heart.break() >= -54000;
    let bb = await ns.bladeburner.inBladeburner();
    if (!shocked && (needCrime || !bb)) {
      //either not enough deaths to join Speakers of the Dead
      //or not enough lack of karma to make a gang
      //or not in bb, so nothing better to do
      let crime;
      if (ns.formulas.work.crimeSuccessChance(s, "Homicide") > 0.3) {
        crime = ns.enums.CrimeType.homicide;
      } else {
        //not enough combat skills
        let m = -Infinity;
        for (let [_, i] of typeCorrectEntries(ns.enums.CrimeType)) {
          let g = ns.formulas.work.crimeGains(s, i);
          let t = (await ns.singularity.getCrimeStats(i)).time;
          //1/4 the exp on failure
          let w = 1 / 4 + ns.formulas.work.crimeSuccessChance(s, i) * 3 / 4;
          let score = w * (g.agiExp + g.defExp + g.dexExp + g.strExp) / t;
          if (score > m) {
            m = score;
            crime = i;
          }
        }
      }
      if (!crime) throw new Error("impossible;this is just for typescript type checking");
      if (j?.type == "CRIME" && j.crimeType == crime) {
        await ns.asleep(200);
        continue;
      }
      await ns.sleeve.setToCommitCrime(i, crime);
      let t = await ns.sleeve.getTask(i);
      if (t?.type != "CRIME" || t.crimeType != crime) throw new Error("Something is very wrong");
      let comp = t.tasksCompleted;
      while (t.tasksCompleted == comp) {
        t = await ns.sleeve.getTask(i);
        if (t?.type != "CRIME" || t.crimeType != crime) throw new Error("Something is very wrong");
        await ns.asleep(10);//desync from cycle thing
        //this is stupid...someone should make a nextCompletion for SleeveCrimeWork.
      }
      continue;
    }
    if (bb) {
      let task: BladeburnerActionTypeForSleeve | false = false;
      let ass = await ns.bladeburner.getActionEstimatedSuccessChance(
        _BladeburnerActionType.Operation,
        _BladeburnerOperationName.Assassination
      )
      if (
        s.hp.current * 2 <= s.hp.max ||
        (e => e[0] * 1.75 <= e[1])(await ns.bladeburner.getStamina())
      ) {
        task = _BladeburnerGeneralActionName.HyperbolicRegen;
      } else if ((e => e[0] != e[1])(ass)) {
        task = _BladeburnerGeneralActionName.FieldAnalysis;
      } else if (!coord.infil && coord.bbIndex == i) {
        task = _SpecialBladeburnerActionTypeForSleeve.InfiltrateSynthoids;
      } else if ((await ns.bladeburner.getCityChaos(await ns.bladeburner.getCity())) >= 40) {
        task = _BladeburnerGeneralActionName.Diplomacy;
      }
      if (task) {
        let suc = await ns.sleeve.setToBladeburnerAction(i, task);
        let t = await ns.sleeve.getTask(i);
        if (suc && task == _SpecialBladeburnerActionTypeForSleeve.InfiltrateSynthoids) {
          if (t?.type != "INFILTRATE") throw new Error("Something is very wrong");
          coord.infil = true;
          await t.nextCompletion;
          coord.infil = false;
        } else {
          if (t?.type != "BLADEBURNER" || t.actionName != task) throw new Error("Something is very wrong");
          await t.nextCompletion;
        }
        //await ns.asleep(0);
        continue;
      }
      // let tasks: [GymType, number][] = typeCorrectEntries(GymType)
      //   .map(e => [e[1], s.skills[e[0]]]);
      // let worst = tasks.reduce(
      //   (e, f) => ((e[1] > f[1]) ? f : e),
      //   [GymType.strength, Infinity]
      // )[0];
      // if (s.city != "Sector-12") await ns.sleeve.travel(i, "Sector-12");
      // await ns.sleeve.setToGymWorkout(i, "Powerhouse Gym", worst);
      await ns.sleeve.setToIdle(i);//more bonus time
      await ns.asleep(1000);
      continue;
    }
    //!shocked && (needCrime || !bb) => commit crimes
    //bb => bladeburner
    //so we know !(!shocked && (needCrime || !bb)) && !bb
    //=> (shocked || !(needCrime || !bb)) && !bb
    //=> (shocked || !needCrime && bb) && !bb
    //=> (shocked || !needCrime && false) && !bb
    //=> shocked && !bb
    //so removing shock is always correct here
    //(why did i engineer my way into a logic puzzle lol)
    await ns.sleeve.setToShockRecovery(i);
    await ns.asleep(1000);
    continue;
  }
}
async function manageSleeves(ns: NSLike, report: Report) {
  let enterGang!: (v?: unknown) => void, gangPromise = new Promise(res => enterGang = res);
  let hasSentWarning = false;
  let coord: SleeveCoordination = {
    infil: false,
    bbIndex: 0
  }
  if (await ns.gang.inGang()) enterGang();
  gangPromise.then(() => ns.os.launchPromise(() => manageGang(ns, report)));
  //some sleeves may be infiltrating already
  for (let i = 0; i < 8; i++) {
    await ns.sleeve.setToIdle(i);
    ns.os.launchPromise(() => manageSleeve(ns, i, coord));
  }
  while (1) {
    coord.bbIndex = (coord.bbIndex + 1) % 8;
    let averageShock = 0;
    for (let i = 0; i < 8; i++) {
      let s = await ns.sleeve.getSleeve(i);
      averageShock += s.shock / 8;
    }
    if (ns.heart.break() < -54000 && !(await ns.gang.inGang())) {
      //try to make a gang
      if ((await ns.singularity.checkFactionInvitations()).includes(gangName)) {
        await ns.singularity.joinFaction(gangName);
      }
      if ((await ns.getPlayer()).factions.includes(gangName)) {
        await ns.gang.createGang(gangName);
        enterGang();
      } else if (!hasSentWarning) {
        ns.tprint(
          "WARN: " +
          "Somehow, despite his many years of homicide, " +
          "Slum Snakes still refused to let Stanley join.\n" +
          "And Stanley was not happy."
        );
        hasSentWarning = true;
      }
    }
    report.sleeves.averageShock = averageShock;
    report.sleeves.karma = ns.heart.break().toFixed(1);
    report.sleeves.numberOfPeopleKilled = (await ns.getPlayer()).numPeopleKilled
    await ns.asleep(200);
  }
}
function formatIdentifier(k: string) {
  let ret = "";
  for (let i = 0; i < k.length; i++) {
    if (i == 0) ret += k[0].toUpperCase();
    else if (k[i].toUpperCase() == k[i]) ret += " " + k[i].toLowerCase();
    else ret += k[i];
  }
  return ret;
}
function formatReportItem(report: unknown): ReactNode {
  if (typeof report == "number") {
    if (Math.abs(report - Math.round(report)) < 0.0001) return report.toFixed(0);
    return report.toPrecision(4);
  }
  if (typeof report == "boolean") return `${report}`;
  if (typeof report == "string") return [...report].map((e, i) => i ? e : e.toUpperCase()).join("");
  throw new Error("Invalid report item " + JSON.stringify(report));
}
function formatReport(report: unknown, indent: number = 0): ReactNode {
  if (report === null || typeof report != "object") return [formatReportItem(report), <br />];
  let indentString = "- ".repeat(indent);
  return [<br />, typeCorrectEntries(report).flatMap(([title, contents], i) => [
    indentString + formatIdentifier(title) + ": ",
    <span key={i}>{formatReport(contents, indent + 1)}</span>
  ])];
}
async function payload(ns: NSLike) {
  let report = makeBlankReport(ns.enums);
  ns.os.launchPromise(() => manageSleeves(ns, report));
  let win = await ns.os.getTail();
  win.setTitle("Sleeve/Gang Manager");
  win.onClose = () => {
    win.destroy();
    ns.exit(0, true);
  };
  //ui
  while (1) {
    win.setBody(formatReport(report));
    await ns.asleep(200);
  }
}
export async function main(ns: NS) {
  ns.ramOverride(2.6);
  dynamicExport(ns, () => payload);
}