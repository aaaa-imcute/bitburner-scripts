class Dispatcher {
  /** @param {NS} ns */
  constructor(ns, ports) {
    ns.disableLog("ALL");
    //ns.enableLog("exec");
    let vis = [];
    let methods = [ns.nuke, ns.brutessh, ns.ftpcrack, ns.relaysmtp, ns.httpworm, ns.sqlinject];
    let queue = ["home"], i;
    this.servers = [];
    while (i = queue.pop()) {
      if (vis.includes(i)) continue;
      vis.push(i);
      queue.push(...ns.scan(i));
      if (ns.getServerNumPortsRequired(i) <= ports) {
        for (let j = ports; j >= 0; j--)methods[j](i);
      }
      if (ns.hasRootAccess(i)) this.servers.push(i);
    }
    ns.tprint(`Found ${this.servers.length} usable servers`);
  }
  /** @param {NS} ns */
  dispatch(ns, script, threads, ...args) {
    if (threads <= 0) return 0;
    let ram = ns.getScriptRam(script) * threads;
    for (let i of this.servers) {
      if (ns.getServerMaxRam(i) - ns.getServerUsedRam(i) < ram) continue;
      ns.print(`Trying to launch script ${script} to ${i} with ${threads} threads`);
      ns.scp(script, i);
      return ns.exec(script, i, { threads: threads, temporary: true }, ...args);
    }
    return 0;
  }
  /** @param {NS} ns */
  maxThreads(ns, script) {
    let ram = ns.getScriptRam(script);
    let t = 0;
    for (let i of this.servers) {
      t = Math.max(t, Math.floor((ns.getServerMaxRam(i) - ns.getServerUsedRam(i)) / ram));
    }
    return t;
  }
}
class Planner {
  //Strategy
  //for HGW functions,delay is computed first then the effects are applied after the delay
  //this means the time does not change because of previous batch items in a batch
  //growTime=hackingTime*3.2 and weakenTime=hackingTime*4
  //growing increases server security twice as much as hacking
  //security changes are only related to thread and core count,not server security,and are always additive
  //hackingTime is roughly constant assuming min security
  //percent of money hacked is proportional to threads assuming min security
  //the log of serverGrowth is proportional to threads assuming min security
  //plan:one grow script two weaken scripts one hack script
  //grow script should undo hack script in terms of server money
  constructor(target, dispatcher) {
    this.delay = 1;//25;
    this.target = target;
    this.dispatcher = dispatcher;
  }
  /** @param {NS} ns */
  async init(ns) {
    ns.tprint("Initializing " + this.target);
    let time = ns.getWeakenTime(this.target) + 200;
    let ssec = ns.getServerSecurityLevel(this.target);
    let msec = ns.getServerMinSecurityLevel(this.target);
    ns.tprint("Lowering security from " + ssec + " to " + msec);
    let killlist = [];
    while (ns.getServerSecurityLevel(this.target) > msec * (1.01)) {
      let mt = this.dispatcher.maxThreads(ns, "weaken.js");
      let ret = this.dispatcher.dispatch(ns, "weaken.js", mt, this.target, 0, mt);
      if (!ret) {
        ns.print("Progress:" + ((ssec - ns.getServerSecurityLevel(this.target)) / (ssec - msec)));
        await ns.sleep(1000);
      }
      else killlist.push(ret);
    }
    killlist.forEach(e => ns.kill(e));
    killlist = [];
    ns.tprint("Security should be minimal");
    let smon = ns.getServerMoneyAvailable(this.target);
    if (smon == 0) ns.tprint("server empty,cannot determine growth progress");
    let mmon = ns.getServerMaxMoney(this.target);
    ns.tprint("Growing money from " + smon + " to " + mmon);
    while (ns.getServerMoneyAvailable(this.target) < mmon * (1 - 1e-3)) {
      let ti = ns.getWeakenTime(this.target) - ns.getGrowTime(this.target);
      if (ti > this.delay) {
        ti = ti - this.delay;
      } else {
        ns.print("Too easy to hack: difference(0.8*hackTime) is " + ti);
        ti = 0;
      }
      let t = ns.growthAnalyzeSecurity(1) / ns.weakenAnalyze(1);
      //constant,how many weaken threads every grow thread
      let mt = this.dispatcher.maxThreads(ns, "weaken.js") - 2;//both scripts have the same ram cost
      let gt = Math.ceil(mt / (1 + t)), wt = Math.ceil(mt * t / (1 + t));
      if (gt == 0 || wt == 0) {
        //no more space
        await ns.sleep(4000);
        if (smon != 0) {
          let mmm = ns.getServerMoneyAvailable(this.target);
          ns.print("Progress:" + (Math.log(mmm / smon) / Math.log(mmon / smon)));
        }
        continue;
      }
      let ret1 = this.dispatcher.dispatch(ns, "grow.js", gt, this.target, ti, gt);
      let ret2 = this.dispatcher.dispatch(ns, "weaken.js", wt, this.target, 0, wt);
      if (!ret1 || !ret2) {
        //whoops,something went wrong,try again after killing possible fragments of the batch.
        if (ret1) ns.kill(ret1);
        else ns.print("Failed to launch grow thread");
        if (ret2) ns.kill(ret2);
        else ns.print("Failed to launch weaken thread");
        await ns.sleep(4000);
        continue;
      }
      killlist.push(ret1);
      killlist.push(ret2);
      await ns.sleep(this.delay * 2);
    }
    while (ns.getServerSecurityLevel(this.target) > msec * (1.01)) {//wait for weaken thread
      await ns.sleep(100);
    }
    killlist.forEach(e => ns.kill(e));
    //no safety checks because it's ok if the security is a bit high and the money is a bit low
    ns.tprint("Money should be maximal");
    ns.tprint("Extra security(should be 0):" + (ns.getServerSecurityLevel(this.target) - msec));
    ns.tprint("Initialization complete");
  }
  /** @param {NS} ns */
  loop(ns) {
    let mmon = ns.getServerMoneyAvailable(this.target);
    let wt = ((wf) => (e) => e / wf)(ns.weakenAnalyze(1));//weakenAnalyze is linear
    let hat = ns.hackAnalyzeThreads, has = ns.hackAnalyzeSecurity, gas = ns.growthAnalyzeSecurity;
    let target = this.target;
    let arr = [
      e => {
        let r = hat(target, e * mmon);
        if (r == -1) {
          ns.tprint(e + " " + (e * mmon) + " " + mmon);
          ns.exit();
        }
        return r;
      },
      e => wt(has(hat(target, e * mmon) + 0.1)),
      e => ns.growthAnalyze(target, 1 / (1 - e)) + 0.1,
      e => wt(gas(ns.growthAnalyze(target, 1 / (1 - e)) + 0.2))
    ];
    let mt = this.dispatcher.maxThreads(ns, "weaken.js");
    if (ns.args[2]) mt = parseInt(ns.args[2]);
    let [p, th] = this.optimize2(arr, mt, ns.tprint);
    if (p === "nah") {
      ns.print("no solutions? waiting 10s");
      return 10000;//probably not enough threads
    } else {
      ns.tprint("maxThreads: " + mt);
    }
    arr = arr.map(e => e(p));
    if (arr.filter(e => e <= 0).length > 0) {
      ns.tprint("empty batch?");
      ns.exit();
    }
    let times = [
      ns.getHackTime,
      ns.getWeakenTime,
      ns.getGrowTime,
      ns.getWeakenTime
    ].map(e => e(this.target));//.map((e, i) => e(arr[i]));
    let batchTime = 0, bottleneck;
    for (let i = 0; i < times.length; i++) {
      if (times[i] > batchTime) {
        batchTime = times[i];
        bottleneck = i;
      }
    }
    batchTime -= bottleneck * this.delay;
    `let batches = Math.ceil(batchTime / (4 * this.delay));
    //yes ik it should be floor+1 but this gives a bit more time
    //probably doesn't matter since batchTime probably won't be a multiple of this.delay
    let totalTime = batchTime + 4 * this.delay * batches;
    //currently everything finishes at batchTime+4*this.delay
    //each additional batch than the first one starts 4*this.delay later
    //and so would make the whole thing that much later
    ns.print("Doing " + batches + " HWGW batches taking " + totalTime + " ms");
    `//actually no,launching all threads at once would be optimal
    let programs = [
      "hack.js",
      "weaken.js",
      "grow.js",
      "weaken.js"
    ];
    let batches = 0;
    let more = true;
    while (more) {
      //failed hacking threads don't change much other than wasting ram and not making money
      //i'd just ignore them
      let rets = [];
      for (let j = 0; j < programs.length; j++) {
        let extraTime = batchTime + (batches * 4 + j) * this.delay - times[j];
        let threads = arr[j];
        let program = programs[j];
        if (program == "weaken.js") threads = Math.ceil(threads);//no harm in weakening a bit more
        let ret = this.dispatcher.dispatch(ns, program, Math.ceil(threads), this.target, extraTime, threads);
        if (!ret || batches >= 36000) {//we don't need too many batches
          //here's the amount that would make an hour of waiting time for them to die off
          rets.forEach(e => ns.kill(e));//kill incomplete strategies
          ns.tprint("Batch done with " + batches + " HWGW strategies");
          more = false;
          break;
        } else {
          rets.push(ret);
        }
      }
      batches++;
    }
    let stime = batches * 4 * this.delay + batchTime;
    ns.tprint("Waiting " + stime + " ms for current batches to end");
    return stime;
  }
  findRoot(f, v, start, end) {
    //finds root of monotonicly increasing function
    let mid = (start + end) / 2, v2 = f(mid) - v;
    if (Math.abs(v2) < 1e-5) return mid;
    if (v2 < 0) return this.findRoot(f, v, mid, end);
    return this.findRoot(f, v, start, mid);
  }
  optimize(arr, mt = Infinity, debug = e => 0) {
    //minimizes sum(ceil(arr(x))))/x
    //finds integer points of each function first
    //then merges the roots and finds out which midpoint is the best
    let roots = [];
    for (let i of arr) {
      let start = i(0);
      let end = i(1 - 0.2);
      debug("start " + start);
      debug("end " + end);
      for (let j = start; j <= end; j++) {
        let r = this.findRoot(i, j, 0, 1 - 0.2);
        if (Math.abs(i(r) - j) > 1e-3) continue;//no roots(shouldn't happen)
        roots.push(r);
      }
    }
    roots = roots.sort();
    roots = roots.map(e => e + 1e-4);
    debug(roots.length);
    let minv = Infinity, ret = "nah", threads;
    for (let i of roots) {
      let tt = arr.map(e => e(i));
      let nv = tt.map(e => Math.ceil(e)).reduce((e, f) => e + f, 0) / i;
      if (nv < minv && nv * i < mt && !tt.filter(e => e < 0).length) {
        minv = nv;
        threads = nv * i;
        ret = i;
      }
    }
    if (ret === "nah") return [ret, ret];
    return [ret, threads];
  }
  optimize2(arr, mt = Infinity, debug = e => 0) {
    //fixed solution
    //reason:optimize() may result in a ton of unused ram since batches can't be infinitely parallelized
    //doesn't use bisection since precision and speed are not needed
    let ret = 0.4, t;
    do {
      ret -= 0.01;
      if (ret <= 0) return ["nah", "nah"];
      t = arr.map(e => Math.ceil(e(ret))).reduce((e, f) => e + f, 0);
    } while (t > mt);
    return [ret, t];
  }
}
export async function main(ns) {
  let d = new Dispatcher(ns, ns.args[0]);
  let p = new Planner(ns.args[1], d);
  await p.init(ns);
  while (1) {
    await ns.sleep(p.loop(ns));
  }
}