import { dynamicExport, NSLike } from "./os.tsx";

function assertDefined<T>(x: T): asserts x is NonNullable<T> {
  if (x == null) throw new Error("unexpected undefined");
}
function typeCorrectEntries<T extends Object>(obj: T): Array<[keyof T, T[keyof T]]> {
  //ts isn't smart enough to figure out you can use the first item
  //of an item of the result of Object.entries of an object to index that object
  return Object.entries(obj) as any;
}
function makeProgressBar(val: number, start: number, end: number, length: number) {
  let progress = (val - start) / (end - start);
  progress = Math.min(Math.max(progress, 0), 1);//robustness
  progress = Math.round(progress * length);
  return `[${"|".repeat(progress) + "-".repeat(length - progress)}]`;
}
interface Report {
  batchTarget: string;
  batchSize: string;
  batchTime: string;
  batchProgress: string;
  batchEstimatedMoney: string;
  batchEstimatedLevels: number;
  _batchStartTime: number;
  _batchEndTime: number;
  batchLag: string;
};
function makeBlankReport(enums: NSEnums): Report {
  return {
    batchTarget: "home",
    batchSize: "0",
    batchTime: "0 seconds",
    get batchProgress() {
      return makeProgressBar(
        performance.now(),
        this._batchStartTime,
        this._batchEndTime,
        32
      )
    },
    batchEstimatedMoney: "0 seconds",
    batchEstimatedLevels: 0,
    _batchStartTime: 0,
    _batchEndTime: 0,
    batchLag: "(not started yet)"
  };
}
enum HGWType {
  hack = "hack",
  grow = "grow",
  weaken = "weaken"
};
const HGWTypes = [HGWType.hack, HGWType.grow, HGWType.weaken];
type HGWTask = {
  type: HGWType;
  server: Server;
  threads: number;
};
type TempRamAlloc = Record<string, number>;
async function getAllServers(ns: NSLike, server = "home"): Promise<string[]> {
  let a = await ns.scan(server), ret = [server];
  if (server != "home") a.shift();
  for (let i of a) {
    ret.push(...await getAllServers(ns, i));
  }
  return ret;
}
function generateWorker(method: HGWType) {
  return [`batcher/${method}.js`, `/** @param {NS} ns */
export async function main(ns) {
  if (ns.args[0] == "home") ns.exit();
  await ns.${method}(ns.args[0], {
    threads: ns.args[2],
    additionalMsec: ns.args[1]
  });
  globalThis[ns.args[3]]?.();
}`];
}
async function makeWorkers(ns: NSLike) {
  ns.write(`batcher/launch.js`, `/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(2.9);
  if (ns.args[0] == "home") ns.exit();
  globalThis[ns.args[0]].resolve(ns);
  await globalThis[ns.args[0]].promise;
}`, "w");
  let servers = await getAllServers(ns);
  for (let i of HGWTypes) {
    //write files
    let [name, script] = generateWorker(i);
    ns.write(name, script, "w");
    for (let j of servers) {
      await ns.scp(name, j);
    }
    //compile
    ns.run(name, {
      threads: 1,
      temporary: true
    }, "home");
  }
}
function calculateRamCost(type: HGWType, threads: number) {
  return (type == HGWType.hack ? 1.7 : 1.75) * Math.ceil(threads);
}
function calculateMaxThreads(server: Server, temp: number = 0) {
  return Math.floor((server.maxRam - server.ramUsed - temp) / 1.75);
}
function hasEnoughRam(server: Server, ram: number, temp: TempRamAlloc) {
  return ram + (temp[server.hostname] ?? 0) + server.ramUsed <= server.maxRam;
}
function spendRam(server: string, ram: number, temp: TempRamAlloc) {
  temp[server] = (temp[server] ?? 0) + ram;
}
function mergeAlloc(a: TempRamAlloc, b: TempRamAlloc) {
  for (let [k, v] of Object.entries(b)) {
    spendRam(k, v, a);
  }
}
function tryMakeTask(
  server: Server | undefined,
  type: HGWType,
  threads: number,
  temp: TempRamAlloc,
  ram?: number
): HGWTask | false {
  if (!server) return false;
  ram = ram ?? calculateRamCost(type, threads);
  spendRam(server.hostname, ram, temp);
  return {
    type: type,
    server: server,
    threads: threads
  };
}
function makeHackingPlan(
  server: Server,
  player: Player,
  hacking: HackingFormulas,
  weakenEffect: number,
  minThreads: number,//minimum amount of total threads to use up all ram in a reasonable amount of batches
  maxThreads: number//maximum size of a thread
): [number, number] | undefined {
  assertDefined(server.moneyMax);
  assertDefined(server.minDifficulty);
  let sec = server.hackDifficulty, mon = server.moneyAvailable;
  server.hackDifficulty = server.minDifficulty;
  server.moneyAvailable = server.moneyMax;
  let hp = hacking.hackPercent(server, player);
  let m = -Infinity, best: [number, number] | undefined;
  for (let ht = 1; ht < Math.ceil(1 / hp); ht++) {
    server.moneyAvailable *= Math.max(0, 1 - hp * ht);
    server.hackDifficulty = server.minDifficulty + 0.002 * ht;
    let gt = hacking.growThreads(server, player, server.moneyMax);
    let wt = Math.ceil(0.002 * (ht + gt * 2) / weakenEffect);
    let total = ht + gt + wt;
    if (total < minThreads) continue;
    if (Math.max(ht, gt, wt) > maxThreads) break;
    if (ht / total > m) {
      //money is proportional to hack threads here so just check that instead of actually checking money
      m = ht / total;
      best = [ht, gt];
    }
  }
  server.hackDifficulty = sec;
  server.moneyAvailable = mon;
  if (!best) return;
  return best;
}
function makeHackTask(
  server: Server,
  servers: Server[],
  plan: [number, number],
  weakenEffect: number
): HGWTask[] | false {
  let temp: TempRamAlloc = {};
  //at the start of the current loop, so servers is always sorted
  let target = servers[servers.length - 1];
  let hr = calculateRamCost(HGWType.hack, plan[0]);
  if (!hasEnoughRam(target, hr, temp)) return false;
  let h = tryMakeTask(target, HGWType.hack, plan[0], temp, hr);
  //check if the hack thread has made servers unsorted
  let target2 = servers[servers.length - 2];
  if (target2 && target.maxRam - target.ramUsed - hr < target2.maxRam - target2.ramUsed) target = target2;
  let gr = calculateRamCost(HGWType.grow, plan[1]);
  if (!hasEnoughRam(target, gr, temp)) return false;
  let g = tryMakeTask(target, HGWType.grow, plan[1], temp, gr);
  let w = makeWeakenTask(server, servers, temp, (plan[0] + plan[1] * 2) * 0.002, weakenEffect);
  if (!w) return false;
  if (!h || !g) throw new Error("impossible");
  return [h, g, ...w];
}
function makeGrowTask(
  server: Server,
  player: Player,
  servers: Server[],
  hacking: HackingFormulas,
  weakenEffect: number
): HGWTask[] | false {
  //this is never called by makeHackTask and so only needs to get as much as possible
  //or atleast that for one server since it will be called again next loop anyways
  //for a GW batch to work, the ram the grow takes has to be less than the largest server,
  //and the ram the two take in total has to be less than the total amount of ram
  //(rounded down for each server to 1.75 ofc)
  //g<max and g+ceil(c*g)<total
  //(c+1)g+1<total would be a sufficient condition for the latter
  //so we have g<min(max,(total-1)/(c+1))
  //of course,overly growing isn't helpful
  assertDefined(server.moneyMax);
  let practicalThreads = hacking.growThreads(server, player, server.moneyMax);
  let totalThreads = servers.reduce((e, f) => e + calculateMaxThreads(server), 0);
  //at the start of the current loop, so servers is always sorted
  let maxThreads = calculateMaxThreads(servers[servers.length - 1]);
  let gt = Math.min(practicalThreads, maxThreads, Math.floor((totalThreads - 1) / (0.004 / weakenEffect + 1)));
  if (gt <= 0) return false;
  let temp: TempRamAlloc = {};
  let gr = calculateRamCost(HGWType.grow, gt);
  if (!hasEnoughRam(servers[servers.length - 1], gr, temp)) throw new Error("really bad math");
  let g = tryMakeTask(servers[servers.length - 1], HGWType.grow, gt, temp, gr);
  let w = makeWeakenTask(server, servers, temp, gt * 0.004, weakenEffect);
  if (!w) throw new Error("really bad math");
  if (!g) throw new Error("impossible");
  return [g, ...w];
}
function makeWeakenTask(
  server: Server,
  servers: Server[],
  temp: TempRamAlloc,
  sec: number,//Infinity -> "as much as possible"
  weakenEffect: number
): HGWTask[] | false {
  assertDefined(server.hackDifficulty);
  assertDefined(server.minDifficulty);
  let nt = Math.ceil(Math.min(sec, server.hackDifficulty - server.minDifficulty) / weakenEffect);
  let ret = [], ttemp: TempRamAlloc = {};
  if (nt == 0) return [];
  for (let i of servers) {
    let t = calculateMaxThreads(i, temp[i.hostname]);
    t = Math.min(t, nt);
    if (t == 0) continue;
    ret.push({
      type: HGWType.weaken,
      server: i,
      threads: t
    });
    spendRam(server.hostname, t * 1.75, ttemp);
    nt -= t;
    if (nt == 0) break;
  }
  if (sec != Infinity && nt != 0) return false;
  mergeAlloc(temp, ttemp);
  return ret;
}
function simulatePlan(
  server: Server,
  player: Player,
  hacking: HackingFormulas,
  weakenEffect: number,
  calculateExp: (skill: number) => number,
  plan: HGWTask[]
) {
  //also return how much money is made and how much the player's levels change
  assertDefined(server.moneyAvailable);
  assertDefined(server.moneyMax);
  assertDefined(server.hackDifficulty);
  assertDefined(server.minDifficulty);
  let start = player.skills.hacking, nextLevel = calculateExp(player.skills.hacking + 1);
  let money = 0;
  for (let i of plan) {
    let exp = hacking.hackExp(server, player);
    if (i.type == HGWType.hack) {
      i.server.ramUsed += i.threads * 1.70;
      let p = hacking.hackPercent(server, player);
      let c = hacking.hackChance(server, player);
      i.threads = Math.min(i.threads, Math.ceil(1 / p));
      player.exp.hacking += exp * i.threads * (1 + 3 * c) / 4;
      let f = Math.min(1, p * i.threads);
      money += c * f * server.moneyMax;
      server.moneyAvailable *= 1 - f;
      server.hackDifficulty += 0.002 * i.threads;
      server.hackDifficulty = Math.min(server.hackDifficulty, 100);
    } else if (i.type == HGWType.grow) {
      i.server.ramUsed += i.threads * 1.75;
      i.threads = Math.min(i.threads, hacking.growThreads(server, player, server.moneyMax));
      server.moneyAvailable = hacking.growAmount(server, player, i.threads);
      player.exp.hacking += exp * i.threads;
      server.hackDifficulty += 0.004 * i.threads;
      server.hackDifficulty = Math.min(server.hackDifficulty, 100);
    } else if (i.type == HGWType.weaken) {
      i.server.ramUsed += i.threads * 1.75;
      i.threads = Math.min(i.threads, Math.ceil((server.hackDifficulty - server.minDifficulty) / weakenEffect));
      player.exp.hacking += exp * i.threads;
      server.hackDifficulty -= weakenEffect * i.threads;
      server.hackDifficulty = Math.max(server.hackDifficulty, server.minDifficulty);
    }
    if (i.server.ramUsed > i.server.maxRam) throw new Error("bad server ram usage");
    while (player.exp.hacking > nextLevel) {
      //shouldn't be inefficient as it is not usual that a single thread gives many levels
      player.skills.hacking++;
      nextLevel = calculateExp(player.skills.hacking + 1);
    }
  }
  return [money, player.skills.hacking - start];
}
function makeBatch(
  server: Server,
  player: Player,
  servers: Server[],
  hacking: HackingFormulas,
  weakenEffect: number,
  calculateExp: (skill: number) => number
): HGWTask[] {
  assertDefined(server.hackDifficulty);
  assertDefined(server.minDifficulty);
  let loopCounter = 0, ret = [], hackingPlan: [number, number] | undefined;
  while (ret.length <= 390000) {
    if (++loopCounter > 1000000) throw new Error("Infinite loop");
    //make the server list into a form that saves a lot of computation
    servers = servers.filter(e => e.maxRam - e.ramUsed >= 1.75);
    servers.sort((e, f) => e.maxRam - e.ramUsed - f.maxRam + f.ramUsed);
    if (!servers.length) break;
    //make new hacking plan if needed
    if (!hackingPlan) {
      let totalThreads = servers.reduce((e, f) => e + calculateMaxThreads(server), 0);
      let maxThreads = calculateMaxThreads(servers[servers.length - 1]);
      hackingPlan = makeHackingPlan(
        server,
        player,
        hacking,
        weakenEffect,
        totalThreads / 390000,
        maxThreads
      );
      if (!hackingPlan) break;
    }
    let plan;
    if (server.hackDifficulty != server.minDifficulty) {
      plan = makeWeakenTask(server, servers, {}, Infinity, weakenEffect);
    } else if (server.moneyAvailable != server.moneyMax) {
      plan = makeGrowTask(server, player, servers, hacking, weakenEffect);
    } else {
      plan = makeHackTask(server, servers, hackingPlan, weakenEffect);
    }
    if (!plan) break;
    if (simulatePlan(server, player, hacking, weakenEffect, calculateExp, plan)[1]) {
      hackingPlan = undefined;
    }
    ret.push(...plan);
  }
  return ret;
}
async function purchasePrograms(ns: NSLike) {
  let programs = ["brutessh", "ftpcrack", "relaysmtp", "httpworm", "sqlinject"];
  if (await ns.singularity.purchaseTor()) {
    for (let i of programs) {
      await ns.singularity.purchaseProgram(i + ".exe");
    }
  }
}
async function purchaseServers(ns: NSLike) {
  let limit = await ns.getPurchasedServerLimit();
  let maxRam = await ns.getPurchasedServerMaxRam();
  let ps = await ns.getPurchasedServers();
  let money = await ns.getServerMoneyAvailable("home");
  for (let i = 2; i < maxRam; i *= 2) {
    for (let j = 0; j < limit; j++) {
      let name = "pserv-" + j;
      if (!ps.includes(name)) {
        await ns.purchaseServer(name, i);
        ps.push(name);
        continue;
      }
      let cost = await ns.getPurchasedServerUpgradeCost(name, i);
      if (cost <= money) {
        await ns.upgradePurchasedServer(name, i);
        money -= cost;
      } else {
        return;
      }
    }
  }
}
async function purchaseHomeRam(ns: NSLike) {
  while (await ns.singularity.upgradeHomeRam()) { }
}
async function updateServerList(ns: NSLike) {
  //in this order: port methods->servers->home ram
  await purchasePrograms(ns);
  await purchaseServers(ns);
  await purchaseHomeRam(ns);
  let servers = await getAllServers(ns), ret = [];
  for (let i of servers) {
    let s = await ns.getServer(i);
    for (let [j, k] of [
      ["sqlinject", "sqlPortOpen"],
      ["httpworm", "httpPortOpen"],
      ["relaysmtp", "smtpPortOpen"],
      ["ftpcrack", "ftpPortOpen"],
      ["brutessh", "sshPortOpen"],
      ["nuke", "hasAdminRights"]
    ]) {
      let pred = s[k as keyof Server];
      assertDefined(pred);
      if (!pred) {
        let method = ns[j as keyof NSLike] as (s: string) => boolean;
        assertDefined(method);
        await method(i);
      }
    }
    if (s.hasAdminRights) {
      //s.ramUsed = 0;//remove
      if (s.hostname == "home") s.ramUsed = Math.min(s.maxRam, s.ramUsed + 32);
      ret.push(s);
      continue;
    }
  }
  return ret;
}
type Batch = {
  tasks: HGWTask[];
  target: string;
  timing: Record<HGWType, number>;
  promise: Promise<[number, number, number]>;
  finish: (start: number, delay: number, time: number) => void;
  remaining: number;
  dec: () => void;
  promise2: Promise<void>;
  finish2: () => void;
  waitTime: number;
};
function decoratePayload(
  tasks: HGWTask[],
  target: string,
  hackTime: number
): Batch {
  let extraDelay = 200 + Math.round(tasks.length / 50);
  let resolve!: (e: [number, number, number]) => void;
  let promise = new Promise(e => resolve = e) as Promise<[number, number, number]>;
  let resolve2!: (v: void) => void;
  let promise2 = new Promise(e => resolve2 = e) as Promise<void>;
  return {
    tasks,
    target,
    timing: {
      [HGWType.hack]: hackTime * 3,
      [HGWType.grow]: hackTime * 0.8,
      [HGWType.weaken]: 0
    },
    promise,
    finish: (...args: [number, number, number]) => resolve(args),
    remaining: tasks.length,
    dec() {
      if (--this.remaining <= 0) this.finish2();
    },
    promise2: tasks.length ? promise2 : new Promise(e => setTimeout(e, 2000)) as Promise<void>,
    finish2: resolve2,
    waitTime: tasks.length ? hackTime * 4 + extraDelay + 100 : 2000
  };
}
function randomInteger() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
async function sendPayload(ns: NSLike, payload: Batch) {
  let launcher = ns;
  if ((e => e.maxRam - e.ramUsed)(await ns.getServer()) < 2.9) {
    //having this little home ram, we probably don't have a lot of batches
    if (payload.tasks.length > 10000) throw new Error("Someone's eating a lot of home ram.");
  } else {
    //we can't ns.exec here because it will get ram-dodged and be way too slow
    let name, resolve!: (f: NS) => void, promise = new Promise(e => resolve = e) as Promise<NS>;
    do {
      name = "batchLauncher_" + randomInteger();
    } while ((globalThis as any)[name] !== undefined);
    (globalThis as any)[name] = { resolve, promise: payload.promise };
    ns.run("batcher/launch.js", {
      threads: 1,
      temporary: true
    }, name);
    launcher = await promise.then(v => {
      delete (globalThis as any)[name];
      return v;
    }) as unknown as NSLike;
  }
  let name;
  do {
    name = "batchFinish_" + randomInteger();
  } while ((globalThis as any)[name] !== undefined);
  (globalThis as any)[name] = () => payload.dec();
  payload.promise2.then(v => {
    delete (globalThis as any)[name];
    return v;
  })
  let start = performance.now(), delay = 0, fixed = 0;
  for (let i of payload.tasks) {
    let time = performance.now() - start;
    if (time - delay - fixed > 50) {
      delay += await launcher.asleep(0);
      fixed += 50;
    }
    await launcher.exec("batcher/" + i.type + ".js", i.server.hostname, {
      temporary: true,
      threads: Math.ceil(i.threads)
    }, payload.target, payload.timing[i.type], i.threads, name);
  }
  payload.finish(start, delay, performance.now() - start);
}
function evaluateTarget(
  server: Server,
  player: Player,
  servers: Server[],
  hacking: HackingFormulas,
  weakenEffect: number
): number {
  //returns number proportional to money rate
  assertDefined(server.moneyMax);
  assertDefined(server.requiredHackingSkill);
  if (!server.hasAdminRights || server.requiredHackingSkill > player.skills.hacking) return 0;
  let totalThreads = servers.reduce((e, f) => e + calculateMaxThreads(server), 0);
  let maxThreads = calculateMaxThreads(servers[servers.length - 1]);
  let plan = makeHackingPlan(
    server,
    player,
    hacking,
    weakenEffect,
    totalThreads / 390000,
    maxThreads
  );
  if (!plan) return 0;
  let sec = server.hackDifficulty;
  server.hackDifficulty = server.minDifficulty;
  let c = hacking.hackChance(server, player);
  let p = hacking.hackPercent(server, player);
  let t = hacking.hackTime(server, player);
  server.hackDifficulty = sec;
  return server.moneyMax * c * plan[0] / (plan[0] + plan[1]) * p / t;
}
function chooseNewTarget(
  oldTarget: Server,
  player: Player,
  servers: Server[],
  hacking: HackingFormulas,
  weakenEffect: number
) {
  let m = -Infinity, best!: Server;
  for (let i of servers) {
    let score = evaluateTarget(i, player, servers, hacking, weakenEffect);
    if (score > m) {
      m = score;
      best = i;
    }
  }
  //should we switch?
  //in the time it takes to prep the new server,
  //the old one would have made some money.
  //if the new server can make that money back in the near future (here 10 minutes),
  //it's a good idea.
  let base = evaluateTarget(oldTarget, player, servers, hacking, weakenEffect);
  let time = hacking.hackTime(best, player);
  if (base * time < m * 600000) {
    return best;
  }
  return oldTarget;
}
async function batcher(ns: NSLike, report: Report) {
  let target = "n00dles";//todo:target selection
  let weakenEffect = await ns.weakenAnalyze(1);
  let hackingMult = (await ns.getPlayer()).mults.hacking *
    (await ns.getBitNodeMultipliers()).HackingLevelMultiplier;
  let calculateExp = (e: number) => ns.formulas.skills.calculateExp(e, hackingMult);
  while (1) {
    let servers = await updateServerList(ns);
    let ramUsed: [Server, number][] = servers.map(e => [e, e.ramUsed]);
    let player = await ns.getPlayer();
    let exp = player.exp.hacking;
    let server = chooseNewTarget(
      await ns.getServer(target),
      player,
      servers,
      ns.formulas.hacking,
      weakenEffect
    );
    target = server.hostname;
    report.batchTarget = target;
    let server2 = structuredClone(server);
    let ht = ns.formulas.hacking.hackTime(server, player);
    let tasks: HGWTask[] = makeBatch(server, player, servers, ns.formulas.hacking, weakenEffect, calculateExp);
    let batch = decoratePayload(tasks, target, ht);
    player.exp.hacking = exp;
    player.skills.hacking = ns.formulas.skills.calculateSkill(exp, hackingMult);
    for (let [i, r] of ramUsed) {
      i.ramUsed = r;
    }
    let est = simulatePlan(server2, player, ns.formulas.hacking, weakenEffect, calculateExp, tasks);
    sendPayload(ns, batch);
    let lag = await batch.promise;
    //await ns.asleep(0);
    report.batchSize = ns.formatNumber(tasks.length);
    report.batchTime = ns.tFormat(batch.waitTime, true);
    report.batchEstimatedMoney = ns.formatNumber(est[0]);
    report.batchEstimatedLevels = est[1];
    report._batchStartTime = performance.now();
    report._batchEndTime = report._batchStartTime + batch.waitTime;
    report.batchLag = [
      "",
      "real    " + ns.tFormat(lag[2], true),
      "user    " + ns.tFormat(lag[1], true),
      "sys     " + ns.tFormat(lag[2] - lag[1], true)
    ].join("\n");
    //ns.write("os/data.txt", tasks.length + " " + lag[1] + " " + lag[2] + "\n", "a");
    //await ns.asleep(batch.waitTime);
    await batch.promise2;
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
  if (typeof report == "number") return report.toPrecision(4);
  if (typeof report == "boolean") return `${report}`;
  if (typeof report == "string") return [...report].map((e, i) => i ? e : e.toUpperCase()).join("");
  throw new Error("Invalid report item " + JSON.stringify(report));
}
function formatReport(report: unknown, indent: number = 0): ReactNode {
  if (report === null || typeof report != "object") return [formatReportItem(report), <br />];
  let indentString = "- ".repeat(indent);
  return [<br />, typeCorrectEntries(report)
    .filter(([title, contents]) => title[0] != "_")
    .flatMap(([title, contents], i) => [
      indentString + formatIdentifier(title) + ": ",
      <span key={i}>{formatReport(contents, indent + 1)}</span>
    ])];
}
async function payload(ns: NSLike) {
  let report = makeBlankReport(ns.enums);
  let win = await ns.os.getTail();
  win.setTitle("Batcher");
  win.onClose = () => {
    win.destroy();
    ns.exit(0, true);
  };
  await makeWorkers(ns);
  ns.os.launchPromise(() => batcher(ns, report));
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