const hAS = e => 0.002 * e;
const gAS = e => 0.002 * 2 * e;//no point in wasting 2GB for those
/** @param {NS} ns */
function simHack(ns, t, s, p) {
  if (t < 0) EnegativeThreads();
  let h = ns.formulas.hacking;
  let m = s.moneyAvailable / s.moneyMax;
  let a = h.hackPercent(s, p);
  t = Math.min(t, m / a);//cap threads
  let percent = a * t;
  p.exp.hacking += h.hackExp(s, p) * t;
  s.hackDifficulty += hAS(t);
  s.hackDifficulty = Math.min(s.hackDifficulty, 100);//cap security
  s.moneyAvailable = s.moneyMax * (m - percent);
  return percent * s.moneyMax;
}
/** @param {NS} ns */
function simGrow(ns, t, s, p, c) {
  if (t < 0) EnegativeThreads();
  let h = ns.formulas.hacking;
  t = Math.min(t, h.growThreads(s, p, s.moneyMax));//cap threads
  let amount = h.growAmount(s, p, t, c)
  p.exp.hacking += h.hackExp(s, p) * t;
  s.hackDifficulty += gAS(t);
  s.hackDifficulty = Math.min(s.hackDifficulty, 100);//cap security
  s.moneyAvailable = amount;
}
/** @param {NS} ns */
function simWeaken(ns, t, s, p, c) {
  if (t < 0) EnegativeThreads();
  let h = ns.formulas.hacking;
  let w = ns.weakenAnalyze(1, c);
  t = Math.min(t, s.hackDifficulty / w);//cap threads
  p.exp.hacking += h.hackExp(s, p) * t;
  s.hackDifficulty -= w * t;
  s.hackDifficulty = Math.max(s.hackDifficulty, s.minDifficulty);//cap security
}
function coreBonus(b) {
  return 1 + (b - 1) / 16;
}
function most(a, t) {
  return a.reduce((e, f) => ((t(e) > t(f)) ? e : f));
}
/** @param {NS} ns */
function threadsWT(ns, sec) {
  //theoretical threads needed to weaken(no core bonus)
  if (sec < 0) EsomehowTryingToWeakenWayTooMuch();
  return sec / ns.weakenAnalyze(1);
}

/**
* @param {NS} ns
* @param {Server[]} bins
*/
function threadsPH(ns, bins, cores = true, verbose = false) {
  //practical threads calculation helper
  let ram = ns.getScriptRam("weaken.js");
  return bins.map(
    e => {
      let r = coreBonus(cores ? e.cpuCores : 1) * Math.floor((e.maxRam - e.ramUsed) / ram);
      if (verbose) return [e, r];
      return r;
    }
  );
}
/**
* @param {NS} ns
* @param {Server[]} bins
*/
function threadsWP(ns, bins, cores = true) {
  //practical weaken threads possible(accounting for core bonus)
  return threadsPH(ns, bins, cores).reduce((e, f) => e + f);
}
/**
* @param {NS} ns
* @param {Server[]} bins
*/
function threadsGP(ns, bins, cores = true) {
  //practical grow threads possible(accounting for core bonus)
  return Math.max(...threadsPH(ns, bins, cores));
}
//hack:prioritize large servers without cores
//grow:prioritize large servers with cores
//weaken:prioritize small servers with cores
/**
* @param {NS} ns
* @param {Server} server
* @param {Player} player
* @param {Server[]} bins
* @param {Number} sec
*/
function stratW(ns, server, player, bins, sec, strict = true) {
  //Tries to weaken the server,returns if it works
  //Splits weaken over many servers
  //May weaken a bit too much
  sec = Math.max(sec, server.minDifficulty);
  if (server.hackDifficulty <= sec) {
    if (strict) EalreadyWeakened();
    return [];
  }
  if (strict && threadsWT(ns, server.hackDifficulty - sec) > threadsWP(ns, bins)) return false;
  let moves = [];
  let b = [...bins];//shallow copy
  while (server.hackDifficulty > sec) {
    if (!b.length) return moves;
    let target = most(b, e => (-100 * (e.maxRam - e.ramUsed) + e.cpuCores));
    let t = Math.ceil(Math.min(threadsWP(ns, [target], false), threadsWT(ns, server.hackDifficulty - sec)));
    if (t == 0) {
      b = b.filter(e => e != target);//no more ram
      continue;
    } else if (t < 0) {
      throw `${threadsWP(ns, [target], false)}, ${threadsWT(ns, server.hackDifficulty - sec)}`;
    }
    simWeaken(ns, t, server, player, target.cpuCores);
    target.ramUsed += t * ns.getScriptRam("weaken.js");
    moves.push(["weaken.js", target.hostname, t]);
  }
  if (moves.length == 0) EbadCheckWeaken();
  return moves;
}
/**
* @param {NS} ns
* @param {Server} server
* @param {Player} player
* @param {Server[]} bins
* @param {Number} sec
*/
function stratGW(ns, server, player, bins, mon, strict = true) {
  //Tries to grow the server,returns if it works
  //Never splits the grow thread even if it doesn't work otherwise
  mon = Math.min(mon, server.moneyMax);
  if (server.moneyAvailable >= mon) {
    if (strict) EalreadyGrown();
    return [];
  }
  let h = ns.formulas.hacking;
  let t = threadsPH(ns, bins, true, true);
  let n = h.growThreads(server, player, mon);
  let mmm = Math.max(...t.map(e => e[1]));
  if (strict && n > mmm) return false;
  n = Math.min(n, mmm);
  let target;
  let sr = ns.getScriptRam("grow.js");
  let mmt = threadsWP(ns, bins, false);
  let wf = threadsWT(ns, gAS(1));//should be constant
  do {
    if (n <= 0) return [];
    //prioritize finishing the job,then not wasting too much space
    let ts = t.filter(e => e[1] >= n);
    if (!ts.length) {
      n = most(t.filter(e => e[1] < n), e => n - e[1])[1];
      throw "what"
      continue;
    }
    target = most(ts, e => n - e[1])[0];
    let gt = n / coreBonus(target.cpuCores);
    let wt = gt * wf + threadsWT(ns, server.hackDifficulty - server.minDifficulty);//very important:NOT n*wf
    //since we already checked if the grow fits,now we just need to remove the threads it costs
    //and check if the weaken fits
    //console.log(mmt);
    if (Math.ceil(wt) + Math.ceil(gt) <= mmt) break;
    if (strict) return false;//at this point it is sadly clear that the job will not be finished
    n -= 1;//what should I do instead?
  } while (1);//probably quite inefficient
  let at = n / coreBonus(target.cpuCores);
  simGrow(ns, at, server, player, target.cpuCores);
  target.ramUsed += Math.ceil(at) * sr;
  if (target.ramUsed > target.maxRam) debugger;
  let w = stratW(ns, server, player, bins, server.minDifficulty);
  if (typeof w == "boolean") EbadCheckGrow();
  if (
    strict && (
      server.hackDifficulty != server.minDifficulty ||
      Math.abs(Math.log(server.moneyAvailable / mon)) >= 1e-3//remember that growThreads may be slightly wrong
    )
  ) console.log(server) || EbadCheckGrow();
  return [["grow.js", target.hostname, at], ...w];
}
/**
* @param {NS} ns
* @param {Server} server
* @param {Player} player
* @param {Server[]} bins
*/
function stratHGW(ns, server, player, bins) {
  //unfortunately the task is too complicated for us to consider cores
  //good thing they don't affect hack nor the security increase of grow
  let h = ns.formulas.hacking;
  let c1 = h.hackPercent(server, player), c2 = hAS(1), c3 = gAS(1), c4 = ns.weakenAnalyze(1);
  let maxThreads = threadsWP(ns, bins, false);
  if (
    server.hackDifficulty != server.minDifficulty ||
    Math.abs(Math.log(server.moneyAvailable / server.moneyMax)) >= 1e-4
  ) console.log(server) || EbadCheckHack();
  let ht, gt, best = -Infinity;
  for (let guess = 1; guess < Math.ceil(1 / c1); guess++) {
    let mon = server.moneyMax * Math.min(1, guess * c1);
    server.moneyAvailable -= mon;
    server.hackDifficulty += guess * c2;
    let gtt = h.growThreads(server, player, server.moneyMax);
    server.moneyAvailable = server.moneyMax;
    server.hackDifficulty += gtt * c3;
    let wt = (server.hackDifficulty - server.minDifficulty) / c4;
    server.hackDifficulty = server.minDifficulty;
    let thr = guess + gtt + Math.ceil(wt);
    if (thr * 15000/*0*/ <= maxThreads) continue;//too many script instances
    if (mon / thr > best) {
      best = mon / thr;
      ht = guess;
      gt = gtt;
    }
  }
  let time = performance.now();
  let moves = [];
  let mult = player.mults.hacking * ns.getBitNodeMultipliers().HackingLevelMultiplier;
  let xp = ns.formulas.skills.calculateExp(
    ns.formulas.skills.calculateSkill(player.exp.hacking, mult) + 1,
    mult
  ) - player.exp.hacking;
  xp = Math.floor(xp / h.hackExp(server, player) / 3);
  let tr = 1.75;
  for (let i = 0; i < Math.min(13000/*0*/, xp); i++) {
    let hts = bins.filter(e => ht * tr + e.ramUsed <= e.maxRam);
    if (!hts.length) break;
    let htarget = most(hts, e => (-100 * (e.maxRam - e.ramUsed) - e.cpuCores));
    htarget.ramUsed += ht * tr;
    let gts = bins.filter(e => gt * tr + e.ramUsed <= e.maxRam);
    if (!gts.length) {
      htarget.ramUsed -= ht * tr;
      break;
    }
    let gtarget = most(gts, e => (-100 * (e.maxRam - e.ramUsed) + e.cpuCores));
    gtarget.ramUsed += gt * tr;
    let wt = threadsWT(ns, ht * hAS(1) + gt * gAS(1));
    if (wt > threadsWP(ns, bins)) {
      htarget.ramUsed -= ht * tr;
      gtarget.ramUsed -= gt * tr;
      break;
    }
    simHack(ns, ht, server, player);
    simGrow(ns, gt, server, player, gtarget.cpuCores);
    moves.push(["hack.js", htarget.hostname, ht], ["grow.js", gtarget.hostname, gt]);
    let wts = bins.filter(e => tr + e.ramUsed <= e.maxRam);
    wts.sort((e, f) => {
      let diff = e.maxRam - e.ramUsed - f.maxRam + f.ramUsed;
      if (diff == 0) return f.cpuCores - e.cpuCores;
      return diff;
    });//sorted in ascending order instead of descending order
    while (wt > 0) {
      if (!wts.length) EbadCheckHack();
      let wtarget = wts.pop();
      let cb = coreBonus(wtarget.cpuCores);
      let wtt = Math.min(Math.ceil(wt / cb), threadsWP(ns, [wtarget], false));
      wt -= wtt * cb;
      wtarget.ramUsed += wtt * tr;
      simWeaken(ns, wtt, server, player, wtarget.cpuCores);
      moves.push(["weaken.js", wtarget.hostname, wtt]);
    }
    if (
      server.hackDifficulty != server.minDifficulty ||
      Math.abs(Math.log(server.moneyAvailable / server.moneyMax)) >= 1e-4
    ) console.log(server) || EbadCheckHack();
  }
  console.log(performance.now() - time);
  //debugger;
  return moves;
}
/**
* @param {NS} ns
* @param {Server[]} bins
* @param {Server} server
*/
export function strategize(ns, bins, server) {
  //"It must make sense to hack the server first"
  //--me after debugging that simHack creates division by zero when hacking 0 money servers
  if (!server.hasAdminRights || server.purchasedByPlayer || server.moneyMax == 0) return [];
  (e => e.ramUsed = Math.min(e.maxRam, e.ramUsed + 64))(bins.find(e => e.hostname == "home"));
  let player = ns.getPlayer();
  let h = ns.formulas.hacking;
  let moves = [], l = -1;
  while (l < moves.length && moves.length < 40000/*0*/) {
    l = moves.length;
    let sec = server.hackDifficulty, mins = server.minDifficulty;
    if (sec > mins) {
      moves.push(...stratW(ns, server, player, bins, mins, false));
      continue;
    }
    let mon = server.moneyAvailable, maxm = server.moneyMax;
    if (mon < maxm) {
      moves.push(...stratGW(ns, server, player, bins, maxm, false));
      continue;
    }
    moves.push(...stratHGW(ns, server, player, bins));
  }
  //console.log(server);
  while (moves.length && (moves.length > 400000 || moves[moves.length - 1][0] != "weaken.js")) {
    moves.pop();
  }
  return moves;
}
/**
* @param {NS} ns
* @param {string} s
* @param {any[][]} strat
*/
export function send(ns, s, strat) {
  let bt = ns.formulas.hacking.hackTime(ns.getServer(s), ns.getPlayer());
  let times = {
    "hack.js": bt * 3,
    "grow.js": bt * 0.8,
    "weaken.js": 0
  };
  let l = [];
  for (let i of strat) {
    let r = ns.scp(i[0], i[1]);
    let r2 = ns.exec(i[0], i[1], { threads: Math.ceil(i[2]), temporary: true }, s, times[i[0]], i[2]);
    if (!r2) {
      for (let i of l) ns.kill(i);
      EbadStrat();
    }
    l.push(r2);
  }
  return bt * 4 + 1000;
}
/** @param {NS} ns */
export function compile(ns) {
  for (let i of ["hack.js", "grow.js", "weaken.js"]) {
    ns.run(i, { threads: 1, temporary: true }, "test");
  }
}
/**
* @param {NS} ns
* @param {Server} server
* @param {any[][]} strat
*/
export function calculateExpectedProfit(ns, server, strat) {
  let player = ns.getPlayer();
  let effect = ns.formulas.hacking.hackPercent(server, player);
  let profit = strat.filter(e => e[0] == "hack.js").reduce((e, f) => e + effect * f[2], 0);
  profit *= server.moneyMax * ns.formulas.hacking.hackChance(server, player);
  return profit;
}