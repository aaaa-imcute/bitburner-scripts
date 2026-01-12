const hAS = e => 0.002 * e;
const gAS = e => 0.002 * 2 * e;//no point in wasting 2GB for those
const ramCost = 1.75;
function enoughRam(target, ram) {
  return target.maxRam - target.ramUsed >= ram;
}
function findTarget(bins, ram, moreCores, lenient = false) {
  let i, end, step;
  if (moreCores) {
    i = bins.length - 1;
    end = -1;
    step = -1;
  } else {
    i = 0;
    end = bins.length;
    step = 1;
  }
  let max = -Infinity, best;
  for (; i != end; i += step) {
    if (enoughRam(bins[i], ram)) {
      return [i, bins[i], true];
    }
    let rem = bins[i].maxRam - bins[i].ramUsed;
    if (lenient && rem > max) {
      max = rem;
      best = [i, bins[i], false];
    }
  }
  if (best) return best;//only happens when lenient
  return [-1, false, false];
}
function cullBins(bins, hitlist) {
  //better to get rid of useless servers than to check them 300000 more times or smth
  //O(product of lengths of the two lists)
  if (hitlist.every(i => enoughRam(bins[i], ramCost))) {
    //nothing to hit
    return bins;
  }
  //splice is O(n) anyways, so why not just filter
  return bins.filter((e, i) => !hitlist.includes(i) || enoughRam(e, ramCost));
}
function calculateBestHackStrat(h, _server, player, maxThreads, c4, lowRam = false) {//todo:account for xp level change
  //since the server would be in a deterministic state by then,
  //we could find the best hack percent before entering the loop
  //that would make us run the following long loop like 300000 times.
  let server = structuredClone(_server);
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  let c1 = h.hackPercent(server, player), c2 = hAS(1), c3 = gAS(1);
  if (lowRam) {
    let mon = server.moneyMax * Math.min(1, c1);
    server.moneyAvailable -= mon;
    server.hackDifficulty += c2;
    let gtt = h.growThreads(server, player, server.moneyMax);
    server.moneyAvailable = server.moneyMax;
    server.hackDifficulty = server.minDifficulty;
    debugger;
    return [1, gtt];
  }
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
    if (thr * 150000 <= maxThreads) continue;//too many script instances
    if (mon / thr > best) {
      best = mon / thr;
      ht = guess;
      gt = gtt;
    }
  }
  if (!ht) {
    //when you hack n00dles after an augmentation while having lots of home ram
    //not even hacking all the money gives enough threads
    //in that case maximum money is maxMoney*maxBatches
    ht = Math.ceil(1 / c1);
    server.moneyAvailable = 0;
    server.hackDifficulty += ht * c2;
    let gtt = h.growThreads(server, player, server.moneyMax);
    server.moneyAvailable = server.moneyMax;
    server.hackDifficulty = server.minDifficulty;
    return [ht, gtt];
  }
  return [ht, gt];
}
function assertRam(server) {
  if (server.maxRam < server.ramUsed) {
    debugger;
    throw "";
  }
}
/**
* @param {NS} ns
* @param {Server[]} bins
* @param {Server} server
*/
export function strategize(ns, _bins, server, lowRam = false) {
  let bad = 0;
  //"It must make sense to hack the server first"
  //--me after debugging that simHack creates division by zero when hacking 0 money servers
  if (!server.hasAdminRights || server.purchasedByPlayer || server.moneyMax == 0) return [];
  (e => e.ramUsed = Math.min(e.maxRam, e.ramUsed + 32))(_bins.find(e => e.hostname == "home"));
  let player = ns.getPlayer();
  let h = ns.formulas.hacking;
  let moves = [];
  let bins = [..._bins];
  bins.sort((e, f) => e.cpuCores - f.cpuCores);//least(hack) to most(grow)
  //"max threads, no cores"
  let mtnc = bins.map(e => Math.floor((e.maxRam - e.ramUsed) / ramCost)).reduce((e, f) => e + f, 0);
  let [hgwht, hgwgt] = calculateBestHackStrat(h, server, player, mtnc, ns.weakenAnalyze(1), lowRam);
  while (moves.length < 390000) {
    bad++;
    if (bad > 1000000) debugger;
    let htarget, gtarget, wtargets = [];
    let ht, gt, hi, gi, _;
    if (server.hackDifficulty == server.minDifficulty) {
      if (server.moneyAvailable == server.moneyMax) {
        //strict hack
        ht = hgwht;
        [hi, htarget, _] = findTarget(bins, ht * ramCost, false);
        if (!htarget) return moves;
        htarget.ramUsed += ht * ramCost;
        assertRam(htarget);
        //strict grow
        gt = hgwgt;
        [gi, gtarget, _] = findTarget(bins, gt * ramCost, true);
        if (!gtarget) {
          htarget.ramUsed -= ht * ramCost;
          return moves;
        }
        gtarget.ramUsed += gt * ramCost;
        assertRam(gtarget);
      } else {
        //lenient grow
        gt = h.growThreads(server, player, server.moneyMax);
        [gi, gtarget, _] = findTarget(bins, gt * ramCost, true, true);
        if (!gtarget) return moves;
        if (!_) gt = Math.floor((gtarget.maxRam - gtarget.ramUsed) / ramCost);
        if (gt <= 0) return moves;
        gtarget.ramUsed += gt * ramCost;
        assertRam(gtarget);
      }
    }
    //weaken(strict or lenient have the same logic;if strict and fail then quit)
    let wtt = (server.hackDifficulty - server.minDifficulty) / ns.weakenAnalyze(1);
    while (wtt > 0) {
      bad++;
      if (bad > 1000000) debugger;
      let wt = Math.ceil(wtt);
      let [wi, wtarget, w_] = findTarget(bins, wt * ramCost, true, true);
      if (!wtarget || !w_) {
        if (gtarget) {
          //strict
          if (htarget) htarget.ramUsed -= ht * ramCost;
          gtarget.ramUsed -= gt * ramCost;
          for (let i of wtargets) {
            i[0].ramUsed -= i[1] * ramCost;
          }
          return moves;
        }
        //lenient
        if (!wtarget) return moves;
      }
      if (!w_) wt = Math.floor((wtarget.maxRam - wtarget.ramUsed) / ramCost);
      if (wt <= 0) return moves;
      wtarget.ramUsed += wt * ramCost;
      assertRam(wtarget);
      wtargets.push([wtarget, wt, wi]);
      wtt -= wt * wtarget.cpuCores;
    }
    //apply effects
    if (htarget) {
      let percent = h.hackPercent(server, player);
      ht = Math.min(ht, 1 / percent);
      moves.push(["hack.js", htarget.hostname, ht]);
      server.moneyAvailable *= 1 - percent * ht;
      server.hackDifficulty += hAS(ht);
      server.hackDifficulty = Math.min(server.hackDifficulty, 100);
      player.exp.hacking += h.hackExp(server, player) * ht;
    }
    if (gtarget) {
      gt = Math.min(gt, h.growThreads(server, player, server.moneyMax, gtarget.cpuCores));
      moves.push(["grow.js", gtarget.hostname, gt]);
      server.moneyAvailable = h.growAmount(server, player, gt, gtarget.cpuCores);
      server.hackDifficulty += gAS(gt);
      server.hackDifficulty = Math.min(server.hackDifficulty, 100);
      player.exp.hacking += h.hackExp(server, player) * gt;
    }
    for (let i of wtargets) {
      moves.push(["weaken.js", i[0].hostname, i[1]]);
      server.hackDifficulty -= ns.weakenAnalyze(i[1], i[0].cpuCores);
      server.hackDifficulty = Math.max(server.hackDifficulty, server.minDifficulty);
      player.exp.hacking += h.hackExp(server, player) * i[1];
    }
    bins = cullBins(bins, [...(htarget ? [hi] : []), ...(gtarget ? [gi] : []), ...wtargets.map(e => e[2])]);
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