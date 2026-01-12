import { dynamicExport, NSLike } from "os/os.tsx";

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
const _BladeburnerContractName: typeof BladeburnerContractName = {
  Tracking: "Tracking",
  BountyHunter: "Bounty Hunter",
  Retirement: "Retirement"
} as typeof BladeburnerContractName;
const _BladeburnerOperationName: typeof BladeburnerOperationName = {
  Investigation: "Investigation",
  Undercover: "Undercover Operation",
  Sting: "Sting Operation",
  Raid: "Raid",
  StealthRetirement: "Stealth Retirement Operation",
  Assassination: "Assassination"
} as typeof BladeburnerOperationName;
const _BladeburnerSkillName: typeof BladeburnerSkillName = {
  BladesIntuition: "Blade's Intuition",
  Cloak: "Cloak",
  ShortCircuit: "Short-Circuit",
  DigitalObserver: "Digital Observer",
  Tracer: "Tracer",
  Overclock: "Overclock",
  Reaper: "Reaper",
  EvasiveSystem: "Evasive System",
  Datamancer: "Datamancer",
  CybersEdge: "Cyber's Edge",
  HandsOfMidas: "Hands of Midas",
  Hyperdrive: "Hyperdrive"
} as typeof BladeburnerSkillName;
interface Report {
  state: "waiting" | "working" | "fixing success rate accuracy" | "fixing success rate";
  taskType: BBTask["type"] | "idle";
  taskName: BBTask["name"] | "doing nothing";
  rank: number;
  skillPoints: number;
  city: CityName;
  chaos: number;
  estimatedPopulation: number;
  stamina: string;
  hp: string;
};
function makeBlankReport(enums: NSEnums): Report {
  return {
    state: "waiting",
    taskType: "idle",
    taskName: "doing nothing",
    rank: 0,
    skillPoints: 0,
    city: enums.CityName.Sector12,
    chaos: 0,
    estimatedPopulation: 1e9,
    stamina: "50/50 (100%)",
    hp: "10/10 (100%)"
  };
}
function typeCorrectEntries<T extends Object>(obj: T): Array<[keyof T, T[keyof T]]> {
  //ts isn't smart enough to figure out you can use the first item
  //of an item of the result of Object.entries of an object to index that object
  return Object.entries(obj) as any;
}
function getSkillLimits(rank: number) {
  //thx zelow :)
  // experimental scaling for combat skills/Cyber's Edge/operation success chance post 400k rank
  const comStats = rank > 4e5 ? Math.max(Math.min(2e6, rank * 1e-4), 1e3) : 400,
    stamStats = rank > 4e5 ? Math.max(Math.min(2e4, rank * 1e-4), 1e3) : 200,
    opStats = rank > 4e5 ? Math.max(Math.min(2e4, rank * 7.5e-5), 1e3) : 200
  return {
    [_BladeburnerSkillName.BladesIntuition]: opStats,//success chance except recruitment +3%
    [_BladeburnerSkillName.Cloak]: opStats,//stealth-related success chance +5.5%
    [_BladeburnerSkillName.ShortCircuit]: 100,//killing success chance +5.5%
    [_BladeburnerSkillName.DigitalObserver]: opStats,//(black) operation success chance +4%
    [_BladeburnerSkillName.Tracer]: 20,//contract success chance +4%
    [_BladeburnerSkillName.Overclock]: 90,//time except general action -1% (Max Level: 90)
    [_BladeburnerSkillName.Reaper]: comStats,//combat stats for bb +2%
    [_BladeburnerSkillName.EvasiveSystem]: comStats,//dex/agi for bb +4%
    [_BladeburnerSkillName.Datamancer]: 80,//population analysis +5%
    [_BladeburnerSkillName.CybersEdge]: stamStats,//max stamina +2%
    [_BladeburnerSkillName.HandsOfMidas]: 200,//contract money +10%
    [_BladeburnerSkillName.Hyperdrive]: 200//experience except general action +10%
  };
}
function shuffle(arr: unknown[]) {
  let i = arr.length;
  while (i != 0) {
    let j = Math.floor(Math.random() * i);
    i--;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function formatNumber(num: number) {
  if (Math.abs(num - Math.round(num)) < 0.0001) return num.toFixed(0);
  return num.toPrecision(4);
}
function formatFraction(current: number, max: number) {
  return `${formatNumber(current)}/${formatNumber(max)} (${formatNumber(current / max * 100)}%)`;
}
type BBTask = {
  type: BladeburnerActionType;
  name: BladeburnerGeneralActionName | BladeburnerContractName |
  BladeburnerOperationName | BladeburnerBlackOpName;
};
async function manageBladeburner(ns: NSLike, report: Report) {
  while (1) {
    if (await ns.bladeburner.joinBladeburnerDivision()) break;
    await ns.asleep(1000);
  }
  let loopCounter = 0, deltaTime = 0;
  while (1) {
    //though it may not look like it, but unlike sleeves,
    //time is divided into current time and overflow time
    //and doing stuff like switching tasks when there's only
    //overflow time doesn't actually waste anything.
    let player = await ns.getPlayer(), stamina = await ns.bladeburner.getStamina();
    report.hp = formatFraction(player.hp.current, player.hp.max);
    report.stamina = formatFraction(stamina[0], stamina[1]);
    let city = report.city = await ns.bladeburner.getCity();
    report.chaos = await ns.bladeburner.getCityChaos(city);
    report.estimatedPopulation = await ns.bladeburner.getCityEstimatedPopulation(city);
    let currentAction = await ns.bladeburner.getCurrentAction();
    if (currentAction && (await ns.bladeburner.getActionCurrentTime()) >= deltaTime) {
      loopCounter = 0;
      deltaTime = await ns.bladeburner.nextUpdate();
      //await ns.asleep(0);
      continue;
    }
    let rank = await ns.bladeburner.getRank();
    report.rank = rank;
    //buy skills
    let limits = typeCorrectEntries(getSkillLimits(rank)), skills = [];
    shuffle(limits);//make it fair
    let remainingItems = limits.length;
    for (let [k, v] of limits) {
      //optimising using https://en.wikipedia.org/wiki/Gossen%27s_second_law
      //involves interpolating quadratic functions and doing convex optimization
      //which is annoying and not much better than the stochastic approach
      //assuming that the increase in skill level is relatively small compared to the existing level
      let level = await ns.bladeburner.getSkillLevel(k);
      let points = await ns.bladeburner.getSkillPoints();
      let target = ns.formulas.bladeburner.skillMaxUpgradeCount(k, level, points / (remainingItems--));
      target = Math.min(target, v - level);
      if (target) await ns.bladeburner.upgradeSkill(k, target);
    }
    report.skillPoints = await ns.bladeburner.getSkillPoints();
    //find best task
    let task: BBTask | undefined;
    let okTasks: BBTask[] = [
      {
        type: _BladeburnerActionType.Contract,
        name: _BladeburnerContractName.Tracking
      },
      {
        type: _BladeburnerActionType.Contract,
        name: _BladeburnerContractName.BountyHunter
      },
      {
        type: _BladeburnerActionType.Contract,
        name: _BladeburnerContractName.Retirement
      },
      {
        type: _BladeburnerActionType.Contract,
        name: _BladeburnerContractName.BountyHunter
      },
      {
        type: _BladeburnerActionType.Operation,
        name: _BladeburnerOperationName.Investigation
      },
      {
        type: _BladeburnerActionType.Operation,
        name: _BladeburnerOperationName.Undercover
      },
      {
        type: _BladeburnerActionType.Operation,
        name: _BladeburnerOperationName.Assassination
      }
    ];
    let bo = await ns.bladeburner.getNextBlackOp();
    if (bo && rank >= bo.rank) okTasks.push({
      type: _BladeburnerActionType.BlackOp,
      name: bo.name
    });
    let m = -Infinity;
    for (let i of okTasks) {
      if ((await ns.bladeburner.getActionCountRemaining(i.type, i.name)) < 1) continue;
      if (i.type == _BladeburnerActionType.Contract || i.type == _BladeburnerActionType.Operation) {
        let level = await ns.bladeburner.getActionMaxLevel(i.type, i.name);
        do {
          await ns.bladeburner.setActionLevel(i.type, i.name, level--);//concurrency issue
        } while (
          level > 0 &&
          (await ns.bladeburner.getActionEstimatedSuccessChance(i.type, i.name))[1] != 1
        );
      }
      if ((await ns.bladeburner.getActionEstimatedSuccessChance(i.type, i.name))[1] != 1) continue;
      //thx Rutabaga :)
      //todo:use actual scores instead of this hardcoded ordinal score
      let score = 1;
      //blackops aren't the best operation to do,but someone's gotta do them
      if (i.type == _BladeburnerActionType.BlackOp) score = 8;
      if (i.name == _BladeburnerOperationName.Assassination) score = 7;
      if (i.name == _BladeburnerOperationName.Undercover) score = 6;
      if (i.name == _BladeburnerOperationName.Investigation) score = 5;
      if (i.name == _BladeburnerContractName.Retirement) score = 4;
      if (i.name == _BladeburnerContractName.BountyHunter) score = 3;
      if (i.name == _BladeburnerContractName.Tracking) score = 2;
      //score /= await ns.bladeburner.getActionTime(i.type, i.name);
      if (score > m) {
        m = score;
        task = i;
      }
    }
    if (!task) task = okTasks[okTasks.length - 1];
    report.state = "working";
    //fix why the task isn't 100% success chance
    let chance = await ns.bladeburner.getActionEstimatedSuccessChance(task.type, task.name);
    if (chance[0] != chance[1]) {
      task.type = _BladeburnerActionType.General;
      task.name = _BladeburnerGeneralActionName.FieldAnalysis;
      report.state = "fixing success rate accuracy";
    } else if (
      chance[0] != 1 ||
      //currentAction?.name == _BladeburnerGeneralActionName.Training &&
      (e => e[0] * 2 <= e[1])(await ns.bladeburner.getStamina())
      //avoid fixing stamina for only a sec then doing the lowest level contracts
      //maybe do the same fix for chaos too?
      //screw it,when stamina matters we are probably in the stage where
      //sleeves are busy killing, every bit of success rate matters, and we should just fix it whenever we can.
    ) {
      //the sleeves should be maintaining stamina and chaos,
      //but maybe they're way too busy killing people to do that.
      //the thresholds (of stamina and chaos) on the sleeves are reached earlier,
      //but here we are guaranteed to hit these checks in time so they can be right on the line.
      report.state = "fixing success rate";
      let city = await ns.bladeburner.getCity();
      if (
        //player.hp.current * 2 <= player.hp.max ||
        (e => e[0] * 2 <= e[1])(await ns.bladeburner.getStamina())
      ) {
        task.type = _BladeburnerActionType.General;
        //task.name = BladeburnerGeneralActionName.HyperbolicRegen;
        task.name = _BladeburnerGeneralActionName.Training;
      } else if ((await ns.bladeburner.getCityEstimatedPopulation(city)) < 1e9) {
        let p = -Infinity;
        for (let [_, i] of typeCorrectEntries(ns.enums.CityName)) {
          let pop = await ns.bladeburner.getCityEstimatedPopulation(city);
          if (pop > p) {
            p = pop;
            city = i;
          }
        }
        await ns.bladeburner.switchCity(city);
        loopCounter++;
        if (loopCounter > 20) {
          //shit
          ns.toast("no more people to kill :(", "error");
          task.type = _BladeburnerActionType.General;
          task.name = _BladeburnerGeneralActionName.Training;
        } else {
          continue;//skip nextUpdate and redo task selection
        }
      } else if ((await ns.bladeburner.getCityChaos(city)) >= 50) {
        task.type = _BladeburnerActionType.General;
        task.name = _BladeburnerGeneralActionName.Diplomacy;
      } else {
        //unfixable lack of success rate? should be impossible
        //(should have a low level contract/operation)
        ns.toast("poor success rate :(", "error");
        task.type = _BladeburnerActionType.General;
        task.name = _BladeburnerGeneralActionName.Training;
      }
    }
    loopCounter = 0;
    report.taskName = task.name;
    report.taskType = task.type;
    await ns.bladeburner.startAction(task.type, task.name);
    deltaTime = await ns.bladeburner.nextUpdate();
    //await ns.asleep(0);
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
  if (typeof report == "number") return formatNumber(report);
  if (typeof report == "boolean") return `${report} `;
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
  ns.os.launchPromise(() => manageBladeburner(ns, report));
  let win = await ns.os.getTail();
  win.setTitle("Bladeburner Manager");
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