export const magicNumber = 1975451718968631;//Math.floor(Math.random()*Number.MAX_SAFE_INTEGER)
function generateLethalPolyfill(fn) {
  //just run it normally and save some ram
  /** @param {NS} ns */
  return (ns, method) => async (...args) => {
    ns.ramOverride(ns.ramOverride() + ns.getFunctionRamCost(fn.join(".")));
    return await fn.reduce((e, f) => e[f], ns)(...args);
  };
}
function generateExplicitPolyfill(index, cond) {
  //inserts ns.pid in some specific case, makes the default parameter explicit
  return (ns, method) => async (...args) => {
    if (cond(...args)) return await method(...args.slice(0, index), ns.pid, ...args.slice(index + 1));
    return await method(...args);
  };
}
function generateThrowingPolyfill(cond, err) {
  return (ns, method) => async (...args) => {
    if (cond(...args)) throw err;
    return await method(...args);
  };
}
//methods that use ram and depend on the current script
//i read every reference to ctx.workerScript that wasn't .hostname or .getServer()
//i really hope i caught all of them (except for those that use the thread count or relative file paths)
export const specialMethods = {
  "run": (ns, method) => ns.run,//no point in ram dodging this :P
  "spawn": generateLethalPolyfill(["spawn"]),
  "killall": generateThrowingPolyfill((_, safetyGuard) => safetyGuard, "please just use the normal kill"),
  "ramOverride": (ns, method) => ns.ramOverride,//or this :P
  "getRunningScript": generateExplicitPolyfill(0, (...args) => !args.length),
};
function generateProgram(fn) {
  //technically a code injection risk like eval()
  return [
    "/** @param {NS} ns */",
    "export async function main(ns){",
    `  ns.getPortHandle(ns.pid + ${magicNumber}).write(await ns.${fn.join(".")}(...[...ns.args].map(JSON.parse)));`,
    "}"
  ].join("\n");
}
/** @param {NS} ns */
export function fixNSObject(ns, fn, maxRam) {
  if (maxRam) ns.ramOverride(4.2 + maxRam);
  fn = fn ?? [];
  let obj = fn.reduce((e, f) => e[f], ns);
  let cache = new Map();//making sure ns.something=ns.something
  return new Proxy(obj, {
    get(target, prop) {
      //please do not use Object.create(ns), whyyyy would you do that lol
      //nor should you use Object.getOwnPropertyDescriptor(ns,method).value, also a weird thing to do
      //(also please don't do the other 1000 silly things, those that chatGPT didn't tell me to warn about)
      let name = [...fn, prop].join(".");
      let value = target[prop];
      let desc = Object.getOwnPropertyDescriptor(target, prop);
      if (desc && desc.configurable === false) return value;
      if (
        (typeof value != "function" && typeof value != "object") ||
        (typeof value == "function" && !ns.getFunctionRamCost(name))
      ) return value;
      if (
        typeof value == "object" &&
        Object.getPrototypeOf(value) !== Object.prototype
      ) return value;//an array or smth
      let wrapped = cache.get(prop);
      if (wrapped) return wrapped;
      if (typeof value == "object") wrapped = fixNSObject(ns, [...fn, prop]);
      else {
        wrapped = async function (...args) {
          ns.ramOverride(2.6);
          let pid = ns.run(
            "ram/" + name.replaceAll(".", "/") + ".js",
            { threads: 1, temporary: true },
            ...args.map(JSON.stringify)
          );
          //yes, HGW and share and something about stanek would work poorly
          //no, you shouldn't ram dodge them because you should put them in a worker script
          //that only has that specific function, which means ram dodging shouldn't help
          if (!pid) throw "failed to ram dodge " + name;
          let port = ns.getPortHandle(pid + magicNumber);
          await port.nextWrite();
          if (maxRam) ns.ramOverride(4.2 + maxRam);
          return port.read();
        }
        let specialMethod = specialMethods[name];
        if (specialMethod) wrapped = specialMethod(ns, wrapped);
      }
      cache.set(prop, wrapped);
      return wrapped;
    }
  });
}
/**
 * Makes the main function receive a ram-dodging ns object.
 * 
 * Please do not do silly things with said object like Object.create.
 * 
 * Change the `export async function main(ns){}`
 * into 
 * ```
 * export function main(ns){
 *   ns.ramOverride(2.6);
 * }
 * main = fixMainFunction(
 *   //your normal "@param" statement
 *   //not writing it here bc it messes up jsdocs stuff
 *   async function (ns) {
 *   }, maxRam);
 * ```
 * always use absolute file paths,
 * and `await` all function calls that take ram
 * (don't worry, no funny funny multithreading problems will happen).
 * 
 * Your script would take up `4.2 + max(ram cost of functions)`,
 * but the wrapper can't figure out what that maximum is
 * (https://en.wikipedia.org/wiki/Rice%27s_theorem), so you have to.
 * If you don't, it will not reserve ram and may throw errors about that.
 * 
 * Obviously, your script's logs would be very different,
 * if you are going to use the tail window just `ns.disableLog("ALL");`
 * (you'd probably have to do that anyways)
 * 
 * You don't need to double `await` methods you normally would need to `await`,
 * but those functions *would* start causing "funny funny multithreading problems",
 * because they would even without the wrapper.
 */
export function fixMainFunction(fun, maxRam) {
  return async ns => {
    await main(ns, [], true);//doesn't cost ram anyways
    return await fun(fixNSObject(ns, [], maxRam));
  };
}
//you'll need these two (for reduce, just do the async stuff outside)
export async function asyncMap(arr, fun) {
  let ret = [];
  for (let [idx, i] of Object.entries(arr)) {
    ret.push(await fun(i, idx, arr));
  }
  return ret;
}
export async function asyncFilter(arr, fun) {
  let l = await asyncMap(arr, fun);
  return arr.filter((_, i) => l[i]);
}
import { getAllServers } from "./scanlib.js";
/** 
 * Initializes ram dodging files, so obviously you must run this first.
 * This is so we don't have to ns.fileExists and other stuff on the fly (which costs ram)
 * @param {NS} ns
 */
export async function main(ns, fn, local = false) {
  fn = fn ?? [];
  let target = fn.reduce((e, f) => e?.[f], ns);
  switch (typeof target) {
    case "object":
      if (Object.getPrototypeOf(target) !== Object.prototype) break;//an array or smth
      for (let i of Object.keys(target)) {
        main(ns, [...fn, i], local);
      }
      break;
    case "function":
      if (ns.getFunctionRamCost(fn.join(".")) == 0) break;//no point ram dodging that :P
      let name = "ram/" + fn.join("/") + ".js";
      ns.write(name, generateProgram(fn), "w");
      if (!local) {
        for (let i of getAllServers(ns)) {
          ns.scp(name, i);
        }
      }
      break;
    case "undefined":
      throw "weird target " + fn;
      break;
    default:
    //not do much, everything with dynamic ram checking is a function (even though ns.hacknet could have some)
    //we are going to have to use ns.ramOverride anyways because people are going to use ns names
  }
}