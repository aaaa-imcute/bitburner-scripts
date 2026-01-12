function forceMicrotask(err, promise, allowMacrotask = false) {
  //doesn't actually force a microtask btw
  if (allowMacrotask) return promise;
  let tookTooLong = new Error(err);//stack trace etc
  return Promise.race([
    promise,
    new Promise((a, b) => setTimeout(() => b(tookTooLong), 0))
  ]);
}
//0:worker scripts
//1:interrupts
let channels = Array(2).fill(0).map(e => {
  return {
    promise: {
      then(res, rej) {
        rej(new Error("empty channel awaited"));
      }
    },
    value: undefined,
    resolve: () => { },
    reject: () => { },
    state: "fulfilled"
  };
});
async function setChannel(channel, value, allowMacrotask = false) {
  let resolve, reject, state = "pending", promise;
  let c = { promise, value, resolve, reject, state };
  c.promise = forceMicrotask("worker script not a microtask", new Promise((res, rej) => {
    c.resolve = e => {
      c.state = "fulfilled";
      c.resolve = c.reject = () => { };
      res(e);
    };
    c.reject = e => {
      c.state = "rejected";
      c.resolve = c.reject = () => { };
      rej(e);
    };
  }), allowMacrotask);
  if (channels[channel].state == "pending") await channels[channel].promise;
  channels[channel] = c;
}
const selfRam = 32;
/** @param {NS} ns */
async function runExternalFunction(ns, ram, args, script, allowCompile = false, useRam = false) {
  script = script ?? ns.getScriptName();
  if (useRam) {
    if (selfRam != ns.ramOverride()) throw "resource hogging";
    if (selfRam < ram + 2.6) throw "not enough ram";
    ns.ramOverride(selfRam - ram);
  }
  await setChannel(0, args, allowCompile);
  ns.run(script, {
    threads: 1,
    temporary: true,
    ramOverride: ram
  });
  let ret = await channels[0].promise;
  if (useRam) ns.ramOverride(selfRam);
  return ret;
}
/** @param {NS} ns */
export async function dynamicImport(ns, file, allowCompile = false, args = undefined) {
  return await runExternalFunction(ns, 1.6, args ?? [], file, allowCompile);
}
/** @param {NS} ns */
export async function dynamicExport(ns, fun) {
  if (channels[0].state != "pending") {
    ns.spawn("os.js", {
      threads: 1,
      spawnDelay: 0
    }, ns.getScriptName());
  }
  channels[0].resolve(fun);
  ns.exit();
}
//Replacement methods for the ns methods that are not fine
//note:they don't have to be methods and they don't have to replace anything
//A ns method is fine if it:
//isn't related to the current script,
//(the current server or path is fine)
//does not run or kill scripts,
//doesn't make concurrency issues(edit:apparently only 7 functions do that),
//is a microtask if it costs ram,
//isn't related to the thread count
//(so batcher workers need to be exec normally)
//(edit:apparently only 6 functions do that,
//those that make concurrency issues minus singularity.installBackdoor),
//doesn't require the script to be alive when the promise fulfills, if it returns one,
//and doesn't take too much ram(selfRam = 32 for this to work at the start of a bitnode,
//so maximum function ram cost is 32 - 1.6 - 2.6 = 27.8)
//now i have to read all the ns functions... :P
//(as of commit d0d7767, i.e release 2.8.1)
const specialMethods = {};
{
  function makeError(err) {
    return (ns, method, target) => () => {
      throw err;
    }
  }
  function makeDontThrow(except) {
    return (ns, method, target) => (...args) => {
      try {
        return method(...args);
      } catch (e) {
        return except;
      }
    }
  }
  function makeDontThrowAsync(except) {
    return (ns, method, target) => (...args) =>
      Promise.resolve(method(...args)).catch(() => except);
  }
  function makeDefaultOwnPID(def) {
    //for ns methods that use helpers.scriptIdentifer
    def = def ?? (async (ns, method, target) => await method(ns.pid));
    return (ns, method, target) => async (...args) => {
      if (args[0] === undefined) return await def(ns, method, target);
      return await method(...args);
    };
  }
  specialMethods.sleep = specialMethods.asleep = function (ns, method, target) {
    //could add more os related stuff
    return function (ms) {
      return new Promise(e => setTimeout(e, ms)).then(() => {
        if (target.instance.dead) throw 143;//apparently some "terminated gracefully" exit code
      });
    }
  };
  specialMethods.hack = specialMethods.grow = specialMethods.weaken = specialMethods.share =
    makeError("threads-sensitive functions cannot be run in the os");
  //todo:pipe ns.print,ns.printf,ns.printRaw to other places than the os log
  //todo:deal with ns.tprint,ns.tprintf,ns.tprintRaw somehow
  //todo:deal with ns.clearLog,ns.disableLog,ns.enableLog,ns.isLogEnabled,ns.getScriptLogs
  specialMethods.tail = makeError("Use ns.ui.openTail instead.");
  specialMethods.moveTail = makeError("Use ns.ui.moveTail instead.");
  specialMethods.resizeTail = makeError("Use ns.ui.resizeTail instead.");
  specialMethods.closeTail = makeError("Use ns.ui.closeTail instead.");
  specialMethods.setTitle = makeError("Use ns.ui.setTailTitle instead.");
  //todo:deal with the ui methods we just told people to use instead
  specialMethods.nuke = specialMethods.brutessh = specialMethods.ftpcrack =
    specialMethods.relaysmtp = specialMethods.httpworm = specialMethods.sqlinject =
    makeDontThrowAsync(false);//implement 3.0.0 (better) behaviour
  specialMethods.run = (ns, method, target) => ns.run;//no point in ram dodging that
  //when you use run you probably want the normal run,
  //but when you use spawn you probably want to do that in the os context instead.
  //if you actually want the normal spawn, just run the script
  //(or launch a timeout to run it) before exiting(which does nothing bad to the ns instance)
  //default delay is now 0 bc that makes more sense
  specialMethods.spawn = (ns, method, target) => async (scriptname, ms = 0, ...args) => {
    setTimeout(() => launchScripts(ns, [scriptname, ...args]), ms);
    target.exit();
  };
  specialMethods.kill = makeDefaultOwnPID((ns, method, target) => target.exit());
  specialMethods.killall = (ns, method, target) => async (hostname, safetyguard = true) => {
    hostname = hostname ?? ns.self().server;
    if (!safetyguard) return await method(hostname, false);
    //method would safetyguard the wrong process
    let scriptsKilled = 0;
    for (let { pid } of ns.ps()) {
      if (pid == ns.pid) continue;
      scriptsKilled += await target.kill(pid);
    }
    return scriptsKilled;
  };
  specialMethods.exit = makeError(0)//"process exited with code 0"
  specialMethods.isRunning = makeDefaultOwnPID((ns, method, target) => true);
  //genuinely good advice + nextPortWrite causes concurrency issues
  specialMethods.writePort = specialMethods.tryWritePort = specialMethods.nextPortWrite =
    specialMethods.readPort = specialMethods.peek = specialMethods.clearPort =
    makeError("You should try ns.getPortHandle() instead.");
  //always returning "os.js" isn't helpful
  specialMethods.getScriptName = (ns, method, target) => () => target.instance.name;
  specialMethods.getRunningScript = makeDefaultOwnPID((ns, method, target) => ns.self());
  specialMethods.ramOverride = makeError("why?");
  specialMethods.getScriptIncome = makeDefaultOwnPID();
  specialMethods.getScriptExpGain = makeDefaultOwnPID();
  specialMethods.atExit = (ns, method, target) => (cb, id = "default") => target.instance.atExit[id] = cb;
  //phew
  //that was all of them in NetscriptFunctions.ts
  specialMethods.args = specialMethods.flags = makeError("doesn't make sense to do that");
  //nothing wrong with singularity apart from installBackdoor and manualHack
  //(those that trigger resets are going to kill the os anyways,
  //and destroyW0r1dD43m0n is probably going to be run
  //when the home server has more than 36.2GB ram.)
  //todo:deal with installBackdoor and manualHack
  //todo:check and deal with corporation and ui
  specialMethods.stanek = {
    chargeFragment: makeError("threads-sensitive functions cannot be run in the os")
  };
  //todo:expose setChannel through the decorated ns object
  //and make pipes (find a way to make sure only the intended
  //recipients get the pipe,using position in the scripts array and more
  //remember that that position changes tho)
}
Object.freeze(specialMethods);
/** @param {NS} ns */
function _decorateNSObject(ns, target, fn) {
  //make a decorated version of ns onto target
  fn = fn ?? [];
  if (!fn.length) {
    for (let [k, v] of Object.entries(ns)) {
      _decorateNSObject(ns, target, [k]);
    }
    return;
  }
  let obj = fn.reduce((e, f) => e[f], ns);
  let tar = fn.slice(0, fn.length - 1).reduce((e, f) => e[f], target);
  let prop = fn[fn.length - 1];
  let special = fn.reduce((e, f) => e?.[f], specialMethods);
  if (typeof obj == "function" && ns.getFunctionRamCost(fn.join("."))) {
    tar[prop] = function (...args) {
      return runExternalFunction(
        ns,
        1.6 + ns.getFunctionRamCost(fn.join(".")),
        { fn, args },
        ns.getScriptName(),
        false,
        true
      );
    };
    if (typeof special == "function") {
      tar[prop] = special(ns, tar[prop], target);
      return;
    }
    return;
  }
  if (typeof special == "function") {
    tar[prop] = special(ns, obj, target);
    return;
  }
  if (typeof obj == "object" && Object.getPrototypeOf(obj) === Object.prototype) {
    //prototype check is for excluding ns.args, which is an array.
    //go down one layer and decorate
    tar[prop] = {};
    for (let [k, v] of Object.entries(obj)) {
      _decorateNSObject(ns, target, [...fn, k]);
    }
    return;
  }
  tar[prop] = obj;//don't need to wrap
}
export function decorateNSObject(ns) {
  let ret = {};
  _decorateNSObject(ns, ret);
  ret.instance = p => {
    ret.instance = p;
    Object.freeze(ret);
  };
  console.log(ret);
  return ret;
}
let scripts = [], runningOS;
/** @param {NS} ns */
export async function launchScripts(ns, ...sc) {
  if (!runningOS) throw new Error("need to start os first");
  if (sc[0] == "default") {
    sc = ns.read("startup.txt").split(",");
  }
  let script = await Promise.all(sc.map(async e => {
    if (typeof e == "string") return [e, await dynamicImport(ns, e, true)];
    return [e[0], await dynamicImport(ns, e[0], true, e.slice(1))];
  }));
  for (let [name, i] of script) {
    let pid = scripts.length;
    let ctx = decorateNSObject(runningOS);
    let instance = Promise.resolve(ctx).then(i).then(v => {
      runningOS.print(`process ${instance.pid} (${name}) exited with exit code ${v ?? 0}`);
    }).catch(e => {
      runningOS.print(`process ${instance.pid} (${name}) exited with exit code ${e ?? 1}`);
    }).finally(() => {
      //run atExit scripts
      for (let callback of Object.values(instance.atExit)) {
        callback();
      }
      //get rid of dead script
      for (let i = instance.pid + 1; i < scripts.length; i++) {
        scripts[i].pid--;
      }
      scripts.splice(instance.pid, 1);
    });
    ctx.instance(instance);//gives reference of instance (to decoration functions)
    instance.pid = pid;
    instance.atExit = {};
    instance.dead = false;
    instance.name = name;
    scripts.push(instance);
    runningOS.print(`process ${instance.pid} (${name}) started`);
  }
}
/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(2.6);
  if (!ns.args.length) {
    //run function as worker script
    let fun = channels[0].value.fn.reduce((e, f) => e[f], ns);
    ns.ramOverride(1.6 + ns.getFunctionRamCost(channels[0].value.fn.join(".")));
    let ret;
    try {
      ret = fun(...channels[0].value.args);
      channels[0].resolve(ret);
    } catch (e) {
      channels[0].reject(e);
    } finally {
      ns.exit();
    }
  }
  //launch new scripts
  //ns->current script, may be os or maybe not
  //runningOS->os ns instance
  ns.disableLog("ALL");
  let needToStartOS = !runningOS;
  if (needToStartOS) {
    //start os
    runningOS = ns;
    if (selfRam != ns.ramOverride(selfRam)) throw "cannot allocate enough ram";
    debugger;
    ns.atExit(() => {
      runningOS = undefined;
    });
  }
  await launchScripts(ns, ...ns.args);
  console.log(ns.ramOverride());
  if (needToStartOS) {
    //not quit
    while (1) {
      await setChannel(1, undefined, true);
      let [cmd, ...args] = await channels[1].promise;
      //deal with syscalls
      switch (cmd) {
        default:
          runningOS.print("invalid syscall received " + cmd + " args " + args.join(","));
      }
    }
  } else {
    ns.exit();
  }
}