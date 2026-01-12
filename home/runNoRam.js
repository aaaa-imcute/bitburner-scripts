export async function eavesdrop(obj, prop, fun, target) {
  let old = obj[prop];
  let list = [];
  obj[prop] = function (...args) {
    let ret = fun.bind(this)(...args);
    if (ret !== undefined) list.push(ret);
    return (new.target) ? new old(...args) : old.bind(this)(...args);
  }
  try {
    await target();
  }
  catch (e) {
    obj[prop] = old;
    throw e;
  }
  obj[prop] = old;
  return list;
}
/** @param {NS} ns */
export async function runNoRam(ns, script, _too, ...args) {
  let ret, too;
  if (_too.threads) {
    too = { ..._too };
    //too.ramOverride = 1.6;
  } else {
    too = _too;
  }
  let phs = await eavesdrop(globalThis, "Proxy", function (_, h) {
    if (!h?.ws?.dynamicLoadedFns) return;
    return h;
  }, function () {
    ret = ns.run(script, too, ...args);
  });
  if (!ret) return 0;
  if (!phs.length) throw "failed to capture";
  let exploit = phs[0].ws;
  exploit.dynamicLoadedFns = new Proxy({}, {
    get(target, prop) {
      return true;
    }
  });
  let prop = {
    get: () => 1.6
  };
  Object.defineProperty(exploit, "dynamicRamUsage", prop);
  Object.defineProperty(exploit, "staticRamUsage", prop);
  exploit.env == new Proxy({}, {
    get(target, prop) {
      if (prop == "stopFlag") return false;
      if (prop == "runningFn") return "";
      return target[prop];
    }
  });
  return ret;
}
/** @param {NS} ns */
export async function main(ns) {
  runNoRam(ns, ...ns.args);
}