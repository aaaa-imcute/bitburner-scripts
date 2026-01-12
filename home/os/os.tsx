import { Channel, PromiseQueue } from "./channel.ts";
import { TailWindow } from "./tailwindow.tsx";
function rejectLater(err: Error) {
  return {
    then() {
      throw err;
    }
  } as unknown as Promise<never>;
}
//0:dynamic import
//1:workers
let channels: Channel[];
let interrupts: PromiseQueue<string[]>;
function resetChannels() {
  channels = Array(2).fill(0).map(e => new Channel());
  interrupts = new PromiseQueue();
}
resetChannels();
const selfRam = 32;
async function runExternalFunction<S>(
  ns: NS,
  ram: number,
  args: S,
  script: string,
  useRam = false
) {
  script = script ?? ns.getScriptName();
  let t = await channels[1].send(args);
  if (useRam) {
    if (selfRam < ram + 2.6) throw new Error("not enough ram");
    ns.ramOverride(selfRam - ram);
  }
  ns.run(script, {
    threads: 1,
    temporary: true,
    ramOverride: ram
  }, "runExternalFunction");
  let ret;
  try {
    ret = (await t.promise).value;
  } catch (e) {
    throw new Error(
      `Failed to run external function ${script} ${JSON.stringify(args)}`,
      { cause: e }
    );
  } finally {
    if (useRam) ns.ramOverride(selfRam);
  }
  return ret;
}
async function dynamicImport(ns: NS, file: string, useRam = true) {
  let t = await channels[0].send(undefined);
  if (useRam) ns.ramOverride(selfRam - 1.6);
  ns.run(file, {
    threads: 1,
    temporary: true,
    ramOverride: 1.6
  }, "dynamicImport");
  let ret = (await t.promise).value;
  if (useRam) ns.ramOverride(selfRam);
  return ret;
}
export async function dynamicExport(ns: NS, fun: (v: unknown) => unknown) {
  if (!runningOS) {
    //os is not started
    ns.ramOverride(3.6);
    ns.spawn("os/os.tsx", {
      threads: 1,
      spawnDelay: 0
    }, ns.getScriptName());
  } else if (ns.args[0] != "dynamicImport") {
    //os is started but script is still run in an incorrect way
    //launch in correct way using syscall
    interrupts.push(["run", ns.getScriptName()]);
  } else {
    //return exports normally
    assertDefined(channels[0].current);
    channels[0].current.resolve(fun(channels[0].current.request));
  }
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
//typescript stuff(some of this is chatgpt code :P )
type IsPlainObject<T> =
  T extends object
  ? T extends Function ? false
  : T extends readonly any[] ? false
  : true
  : false;
type DeepUnion<A, B> =
  IsPlainObject<B> extends false ? B :
  IsPlainObject<A> extends false ? A : {
    [K in (keyof A | keyof B)]:
    K extends keyof A ?
    K extends keyof B ? DeepUnion<A[K], B[K]> : A[K] :
    K extends keyof B ? B[K] : never
  };
type DeepDifference<A, B> =
  IsPlainObject<A> extends false ? A : {
    [K in keyof A as (K extends keyof B ? IsPlainObject<B[K]> extends false ? never : K : K)]:
    K extends keyof B ? DeepDifference<A[K], B[K]> : A[K]
  };
type ScriptInstance = {
  promise: Promise<void>;
  pid: number;
  atExit: Record<string, () => void>;
  dead: boolean;
  exitCode: undefined | number | string | Error;
  name: string;
  windows: Record<string, TailWindow>;
  subprocesses: Promise<unknown>[];
};
export type NSLike = DeepUnion<DeepDifference<NS, {
  //add removed methods here to remove them from the type
  hack: string;
  grow: string;
  weaken: string;
  share: string;
  //todo:some of these can be dealt with with pipes
  print: string;
  printf: string;
  printRaw: string;
  clearLog: string;
  disableLog: string;
  enableLog: string;
  isLogEnabled: string;
  getScriptLogs: string;
  //todo:deal with ns.tprint,ns.tprintf,ns.tprintRaw somehow
  tail: string;
  moveTail: string;
  resizeTail: string;
  closeTail: string;
  setTitle: string;
  spawn: string;
  writePort: string;
  tryWritePort: string;
  nextPortWrite: string;
  readPort: string;
  peek: string;
  clearPort: string;
  ramOverride: string;
  args: string;
  flags: string;
  singularity: {
    manualHack: string;
    installBackdoor: string;
  };
  ui: {
    openTail: string;
    renderTail: string;
    moveTail: string;
    resizeTail: string;
    closeTail: string;
    setTailTitle: string;
    setTailFontSize: string;
  };
  stanek: {
    chargeFragment: string;
  };
}>, {
  sleep: (ms: number) => Promise<number>;
  asleep: (ms: number) => Promise<number>;
  killall: (hostname: string, safetyguard: boolean) => Promise<number>;
  exit: (code?: number, dontThrow?: boolean) => void;
  instance: ScriptInstance;
  os: {
    run: (scriptname: string, ...args: unknown[]) => Promise<number>;
    spawn: (scriptname: string, ms: number, ...args: unknown[]) => never;
    kill: (pid: number) => boolean;
    getTail: (id?: string) => Promise<TailWindow>;
    launchPromise: <T>(promise: () => Promise<T>) => Promise<T>;
  };
}>;//todo:fix types (not just this one)
type SpecialMethod<T, S> = (ns: NS, method: T, target: NSLike) => S;
const helpers = {
  makeError(err: number | string):
    SpecialMethod<(...args: unknown[]) => unknown, () => never> {
    return (ns, method, target) => () => {
      throw err;
    }
  },
  makeDontThrow<T, S extends unknown[], R>(except: T):
    SpecialMethod<(...args: S) => R, (...args: S) => R | T> {
    return (ns, method, target) => (...args) => {
      try {
        return method(...args);
      } catch (e) {
        return except;
      }
    }
  },
  makeDontThrowAsync<T, S extends unknown[], R>(except: T | PromiseLike<T>):
    SpecialMethod<(...args: S) => Promise<R>, (...args: S) => Promise<R | T>> {
    return (ns, method, target) => (...args) =>
      Promise.resolve(method(...args)).catch(() => except);
  },
  makeDefaultOwnPID(def?: SpecialMethod<any, any>): SpecialMethod<any, any> {
    //for ns methods that use helpers.scriptIdentifer
    def = def ?? (async (ns, method, target) => await method(ns.pid));
    return (ns, method, target) => async (...args: any[]) => {
      if (args[0] === undefined) return await def(ns, method, target);
      return await method(...args);
    };
  },
  async createWindow(ns: NS, target: NSLike, id: string): Promise<TailWindow> {
    let win = target.instance.windows[id];
    if (!win) win = target.instance.windows[id] = (await runExternalFunction(
      ns,
      1.6,
      { fn: ["newWindow"] },
      ns.getScriptName(),
      true
    )) as TailWindow;
    return win;
  },
  getWindow(target: NSLike, id: string | TailWindow): TailWindow {
    if (id instanceof TailWindow) return id;
    let win = target.instance.windows[id];
    if (!win) throw new Error("window " + id + " does not exist for " + target.instance.pid);
    return win;
  },
  sleepFn(ns: NS, method: unknown, target: NSLike) {
    //could add more os related stuff
    return function (ms: number) {
      let start = performance.now();
      return new Promise(e => setTimeout(e, ms)).then(() => {
        if (target.instance.dead) throw target.instance.exitCode ?? 143;
        //apparently some "terminated gracefully" exit code
        return performance.now() - start;
      });
    }
  }
}
const specialMethods = {
  sleep: helpers.sleepFn,
  asleep: helpers.sleepFn,
  hack: helpers.makeError("threads-sensitive functions cannot be run in the os"),
  grow: helpers.makeError("threads-sensitive functions cannot be run in the os"),
  weaken: helpers.makeError("threads-sensitive functions cannot be run in the os"),
  share: helpers.makeError("threads-sensitive functions cannot be run in the os"),
  //todo:some of these can be dealt with with pipes
  print: helpers.makeError("tail window unavailable, make your own ui"),
  printf: helpers.makeError("tail window unavailable, make your own ui"),
  printRaw: helpers.makeError("tail window unavailable, make your own ui"),
  clearLog: helpers.makeError("tail window unavailable, make your own ui"),
  disableLog: helpers.makeError("tail window unavailable, make your own ui"),
  enableLog: helpers.makeError("tail window unavailable, make your own ui"),
  isLogEnabled: helpers.makeError("tail window unavailable, make your own ui"),
  getScriptLogs: helpers.makeError("tail window unavailable, make your own ui"),
  //todo:deal with ns.tprint,ns.tprintf,ns.tprintRaw somehow
  tail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
  moveTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
  resizeTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
  closeTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
  setTitle: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
  nuke: helpers.makeDontThrowAsync(false),//implement 3.0.0 (better) behaviour
  brutessh: helpers.makeDontThrowAsync(false),
  ftpcrack: helpers.makeDontThrowAsync(false),
  relaysmtp: helpers.makeDontThrowAsync(false),
  httpworm: helpers.makeDontThrowAsync(false),
  sqlinject: helpers.makeDontThrowAsync(false),
  run: (ns: NS, method: unknown, target: NSLike) => ns.run,//no point in ram dodging that
  spawn: helpers.makeError(
    "Why would you do that? You probably want to use ns.os.spawn.\n" +
    "If you really mean it, use:\nns.sleep(ms).then(()=>ns.run(...));\nns.exit();"
  ),
  kill: helpers.makeDefaultOwnPID((ns, method, target) => target.exit),
  killall: (
    ns: NS,
    method: (hostname: string, safetyguard: boolean) => Promise<number>,
    target: NSLike
  ) =>
    async (hostname: string, safetyguard = true) => {
      hostname = hostname ?? ns.self().server;
      if (!safetyguard) return await method(hostname, false);
      //method would safetyguard the wrong process
      let scriptsKilled = 0;
      for (let { pid } of ns.ps()) {
        if (pid == ns.pid) continue;
        scriptsKilled += +await target.kill(pid);
      }
      return scriptsKilled;
    },
  exit: (ns: NS, method: unknown, target: NSLike) => (code?: number, dontThrow?: boolean) => {
    target.instance.dead = true;
    target.instance.exitCode = code ?? 0;
    if (!dontThrow) throw code;
  },
  isRunning: helpers.makeDefaultOwnPID(() => true),
  //genuinely good advice
  writePort: helpers.makeError("You should try ns.getPortHandle() instead."),
  tryWritePort: helpers.makeError("You should try ns.getPortHandle() instead."),
  nextPortWrite: helpers.makeError("You should try ns.getPortHandle() instead."),
  readPort: helpers.makeError("You should try ns.getPortHandle() instead."),
  peek: helpers.makeError("You should try ns.getPortHandle() instead."),
  clearPort: helpers.makeError("You should try ns.getPortHandle() instead."),
  //always returning "os/os.tsx" isn't helpful
  getScriptName: (ns: NS, method: unknown, target: NSLike) => () => target.instance.name,
  getRunningScript: helpers.makeDefaultOwnPID((ns, method, target) => ns.self()),
  ramOverride: helpers.makeError("why?"),
  getScriptIncome: helpers.makeDefaultOwnPID(),
  getScriptExpGain: helpers.makeDefaultOwnPID(),
  atExit: (ns: NS, method: unknown, target: NSLike) =>
    (cb: () => void, id = "default") => target.instance.atExit[id] = cb,
  //phew
  //that was all of them in NetscriptFunctions.ts
  args: () => undefined,
  flags: () => undefined,
  //nothing wrong with singularity apart from installBackdoor and manualHack
  //(those that trigger resets are going to kill the os anyways,
  //and destroyW0r1dD43m0n is probably going to be run
  //when the home server has more than 36.2GB ram.)
  singularity: {
    manualHack: helpers.makeError("threads-sensitive functions cannot be run in the os"),
    installBackdoor: helpers.makeError(
      "This hogs RAM for a non-instantaneous amount of time, " +
      "so please run it outside the os."
    )
  },
  //all ui methods except closeTail only work on running scripts
  //annoying...
  //we'll have to make our own stuff then
  //well, at least this fixes the function signatures.
  ui: {
    openTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    renderTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    moveTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    resizeTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    closeTail: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    setTailTitle: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead"),
    setTailFontSize: helpers.makeError("normal ui methods not available, use ns.os.getTail()'s methods instead")
  },
  stanek: {
    chargeFragment: helpers.makeError("threads-sensitive functions cannot be run in the os")
  },
  //extra methods that aren't in ns
  os: (ns: NS, method: unknown, target: NSLike) => {
    return {
      //run and kill don't actually use the syscalls because
      //real os engineering is hard and unnecessarily annoying
      //(i.e it would make them async functions)
      run: async (scriptname: string) => {
        //todo:return a pipe (after implementing that)
        return (await launchScripts(ns, scriptname))[0];
      },
      spawn: (scriptname: string, ms = 0) => {
        //todo:send something through a pipe
        setTimeout(() => launchScripts(ns, scriptname), ms);
        target.exit();
      },
      kill: (pid: number) => {
        if (!scripts[pid]) return false;
        scripts[pid].dead = true;
        scripts[pid].exitCode = 143;
        return true;
      },
      getTail: (id?: string) => {
        return helpers.createWindow(ns, target, id ?? "default");
      },
      launchPromise<T>(promise: () => Promise<T>) {
        //launches the promise and handles errors
        //don't use when you want to await the promise and so already have error handling
        let p = promise().catch(e => {
          target.instance.dead = true;
          target.instance.exitCode = e ?? 1;
        }).finally(() => {
          target.instance.subprocesses = target.instance.subprocesses.filter(e => e != p);
        });
        target.instance.subprocesses.push(p);
        return p;
      }
    };
  }
  //todo:make pipes(find a way to exchange pipe object references between processes)
};
Object.freeze(specialMethods);
function _decorateNSObject(ns: NS, target: NSLike, fn?: string[]) {
  //make a decorated version of ns onto target
  fn = fn ?? [];
  if (!fn.length) {
    for (let k of [...Object.keys(ns), "os"]) {
      _decorateNSObject(ns, target, [k]);
    }
    return;
  }
  let obj = fn.reduce((e, f) => (e as any)[f], ns);
  let tar = fn.slice(0, fn.length - 1).reduce((e, f) => (e as any)[f], target);
  let prop = fn[fn.length - 1];
  let special = fn.reduce((e, f) => (e as any)?.[f], specialMethods) as unknown as (
    ns: NS,
    method: unknown,
    target: NSLike
  ) => unknown;
  if (typeof obj == "function" && ns.getFunctionRamCost(fn.join("."))) {
    (tar as any)[prop] = function (...args: unknown[]) {
      if (target.instance.dead) throw target.instance.exitCode ?? 143;
      return runExternalFunction(
        ns,
        1.6 + ns.getFunctionRamCost(fn.join(".")),
        { fn, args, stack: new Error("When running this function") },
        ns.getScriptName(),
        true
      );
    };
    if (typeof special == "function") {
      (tar as any)[prop] = special(ns, (tar as any)[prop], target);
      return;
    }
    return;
  }
  if (typeof special == "function") {
    (tar as any)[prop] = special(ns, obj, target);
    return;
  }
  if (typeof obj == "object" && Object.getPrototypeOf(obj) === Object.prototype) {
    //prototype check is for excluding ns.args, which is an array.
    //go down one layer and decorate
    (tar as any)[prop] = {};
    for (let [k, v] of Object.entries(obj) as [keyof NS, NS[keyof NS]][]) {
      _decorateNSObject(ns, target, [...fn, k]);
    }
    return;
  }
  (tar as any)[prop] = obj;//don't need to wrap
}//
function decorateNSObject(ns: NS, instance: ScriptInstance) {
  let ret: NSLike = {} as NSLike;
  _decorateNSObject(ns, ret);
  ret.instance = instance;
  Object.freeze(ret);
  return ret;
}
let scripts: ScriptInstance[] = [], runningOS: NS | undefined;
function isNotNullish<T>(argument: T | undefined | null): argument is T {
  return argument != null;
}
function assertDefined<T>(x: T): asserts x is NonNullable<T> {
  if (x == null) throw new Error("unexpected undefined");
}
export async function launchScripts(ns: NS, ...sc: string[]) {
  if (!isNotNullish<NS>(runningOS)) throw new Error("need to start os first");
  let script: [string, (...args: unknown[]) => unknown][] = [];
  for (let i of sc) {
    script.push([i, await dynamicImport(ns, i, true) as any]);
  }
  let ret = [];
  for (let [name, i] of script) {
    let pid = scripts.length;
    let instance: ScriptInstance = {
      promise: rejectLater(new Error("not ready yet")),
      pid: pid,
      atExit: {},
      dead: false,
      exitCode: undefined,
      name: name,
      windows: {},
      subprocesses: []
    };
    let ctx = decorateNSObject(runningOS, instance);
    //a delay is put before each script bc they can't be in the same macrotask
    instance.promise = new Promise(e => setTimeout(e)).then(async e => {
      let v = await i(ctx);
      await Promise.all(instance.subprocesses);
      return v;
    }).then(v => {
      interrupts.push([
        "echo",
        `Process ${instance.pid} (${name}) exited with exit code ${v ?? instance.exitCode ?? 0}`
      ]);
    }).catch(e => {
      //if (e instanceof Error) throw e;
      interrupts.push([
        "echo",
        `Process ${instance.pid} (${name}) exited with exit code ${e ?? instance.exitCode ?? 1}`
      ]);
    }).finally(() => {
      //run atExit scripts
      for (let callback of Object.values(instance.atExit)) {
        callback();
      }
      //get rid of windows
      for (let window of Object.values(instance.windows)) {
        window.destroy();
      }
      //get rid of dead script
      for (let i = instance.pid + 1; i < scripts.length; i++) {
        scripts[i].pid--;
      }
      scripts.splice(instance.pid, 1);
    });
    scripts.push(instance);
    interrupts.push(["echo", `Process ${instance.pid} (${name}) started`]);
    ret.push(pid);
  }
  return ret;
}
let notNS = { ramOverride: (r: number) => r };
export async function main(ns: NS) {//
  notNS.ramOverride(2.6);
  if (ns.args[0] == "runExternalFunction") {
    //run function as worker script
    let req = channels[1].current;
    if (!req) throw new Error("empty channel? this shouldn't happen.");
    let received = req.request as {
      fn: string[];
      args: any[];
    };
    let newWindow = received.fn[0] === "newWindow";
    let fun = newWindow ? () => new TailWindow(ns) :
      received.fn.reduce((e, f) => (e as any)[f], ns) as unknown as (...args: unknown[]) => unknown;
    ns.ramOverride(1.6 + (newWindow ? 0 : ns.getFunctionRamCost(received.fn.join("."))));
    let ret;
    try {
      ret = fun(...(received.args ?? []));
      req.resolve(ret);
    } catch (e) {
      req.reject(e);
    } finally {
      ns.exit();
    }
  }
  //launch new scripts
  //ns->current script, may be os or maybe not
  //runningOS->os ns instance
  ns.disableLog("ALL");
  let sc = (!ns.args.length) ? ns.read("os/startup.txt").split(" ") : ns.args;
  let needToStartOS = !runningOS;
  if (needToStartOS) {
    //start os
    runningOS = ns;
    if (selfRam != ns.ramOverride(selfRam)) throw new Error("cannot allocate enough ram");
    let win = new TailWindow(ns);
    ns.atExit(() => {
      runningOS = undefined;
      resetChannels();
      win.destroy();
      for (let i of scripts) {
        i.dead = true;
        i.exitCode = 143;
      }
      setTimeout(() => scripts = []);
    });
    win.setTitle("OS");
    win.setMinimized(true);//so we don't steal keyboard focus immediately
    win.onClose = win.onRerun = () => ns.exit();
    let logs: string[] = [], prevCommands: string[] = [], yPos = 0;
    let updateLogs: {
      promise: Promise<void>,
      resolve: () => void,
      presolve: () => void
    } = {
      promise: Promise.resolve(),
      resolve: () => {
        updateLogs.presolve();
        updateLogs.promise = new Promise(f => updateLogs.presolve = f);
      },
      presolve: () => { }
    };
    updateLogs.resolve();
    let [setInput, onKeyDown] = (function () {
      let el: undefined | HTMLInputElement;
      function setValueProperly(v: string) {
        if (!el) return;
        el.value = v;
        requestAnimationFrame(() => {
          if (!el) return;
          el.focus();
          el.setSelectionRange(v.length, v.length);
        });
      }
      return [
        (e: HTMLInputElement) => el = e,
        (nextInput: (v: string) => void) => (e: KeyboardEvent | React.KeyboardEvent<HTMLInputElement>) => {
          if (el == undefined) return;
          if (e.key == "Enter") {
            nextInput(el.value);
            if (el.value != prevCommands[prevCommands.length - 1]) {
              prevCommands.push(el.value);
            }
            yPos = prevCommands.length;
            setValueProperly("");
          } else if (e.key == "ArrowUp") {
            yPos--;
            if (yPos < 0) yPos = 0;
            setValueProperly(prevCommands[yPos]);
          } else if (e.key == "ArrowDown") {
            yPos++;
            if (yPos >= prevCommands.length) {
              yPos = prevCommands.length;
              setValueProperly("");
            } else {
              setValueProperly(prevCommands[yPos]);
            }
          }
        }
      ];
    })();
    (async function () {
      while (1) {
        let [cmd, ...args] = (await interrupts.promise).value as [string, ...unknown[]];
        //todo: pipes
        switch (cmd) {
          case "echo":
            if (args[0]) {
              logs.push(`[${args[1] ?? "LOG"}] ${args[0]}`);
              updateLogs.resolve();
              break;
            }
          case "ps":
            logs.push(...scripts.map(e => `${e.pid}: ${e.name}`));
            break;
          case "kill":
            let killed = 0;
            for (let i of args) {
              let num = Number(i);
              if (Number.isSafeInteger(num) && scripts[num]) {
                scripts[num].dead = true;
                scripts[num].exitCode = 143;
                logs.push(`Killing ${num}`);
                killed++;
              } else {
                logs.push(`Unable to kill ${i} because it is not a pid`);
              }
            }
            logs.push(`Killed ${killed} scripts`);
            updateLogs.resolve();
            break;
          case "exit":
            logs.push(`Have a nice day!`);
            updateLogs.resolve();
            setTimeout(() => ns.exit(), 100);
            break;
          case "run":
            let launched = 0;
            for (let i of args) {
              let s = `${i}`;
              try {
                logs.push(`Launching ${s} with pid ${(await launchScripts(ns, s))[0]}`);
                launched++;
              } catch (e) {
                logs.push(`Failed to launch ${s} because ${e}`);
              }
            }
            logs.push(`Launched ${launched} scripts`);
            updateLogs.resolve();
            break;
          case "tidy":
            //doesn't fit here as a syscall, it's just here for the command line interface
            let [x, y] = win.getPosition();
            for (let i of scripts) {
              for (let j of Object.values(i.windows)) {
                y += 35;
                j.move(x, y);
                j.setMinimized(true);
              }
            }
            break;
          default:
            logs.push(`[ERROR] Invalid syscall received "${cmd}" args ${JSON.stringify(args)}`);
            updateLogs.resolve();
        }
      }
    })();
    await launchScripts(ns, ...sc.map(e => String(e)));
    let listener = undefined;
    while (1) {
      let nextInput!: (v: string) => void, pNextInput: Promise<string> = new Promise(e => nextInput = e);
      if (listener) {
        document.removeEventListener("keydown", listener);
        listener = undefined;
      }
      win.setBody([
        ...logs.flatMap((e, i) => [e, <br key={i} />]),
        <span
          key={logs.length}
          style={{
            display: "flex",
            width: "calc(100% - 2px)"
          }}
        >
          {"> "}
          <input
            autoFocus
            key={logs.length}
            onKeyDown={onKeyDown(nextInput)}
            style={{
              all: "unset",
              font: "inherit",
              color: "inherit",
              backgroundColor: "inherit",
              boxSizing: "border-box",
              flex: 1,
              minWidth: 0
            }}
          />
        </span>
      ]);
      let inputEl = win.bodyState.ref?.current?.querySelector("span > input");
      if (inputEl instanceof HTMLInputElement) setInput(inputEl);
      if (!listener && win.isOpen && !win.isMinimized() && inputEl instanceof HTMLElement) {
        listener = (e: KeyboardEvent) => {
          if (document.activeElement != inputEl) onKeyDown(nextInput)(e);//fix missing event
          inputEl.focus();
        };
        document.addEventListener("keydown", listener);
      }
      pNextInput.then(e => {
        logs.push("> " + e);
        interrupts.push(e.split(" "));
        updateLogs.resolve();
      })
      await updateLogs.promise;
      if (win.destroyed) ns.exit();
    }
  } else {
    await launchScripts(ns, ...sc.map(e => String(e)));
    ns.exit();
  }
}