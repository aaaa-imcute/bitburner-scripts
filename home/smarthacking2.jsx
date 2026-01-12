import { Dispatcher } from "dispatcher.js";//not using full functionality,just the server rooting
import { strategize, send, compile, calculateExpectedProfit } from "batcherlite.js";
import { ConsoleState, Console } from "Console.jsx"
import { TextboxState, Textbox } from "Textbox.jsx"
function makeProgressBar(val, start, end, length) {
  let progress = (val - start) / (end - start);
  progress = Math.min(Math.max(progress, 0), 1);//robustness
  progress = Math.round(progress * length);
  return `[${"|".repeat(progress) + "-".repeat(length - progress)}]`;
}
async function chooseTarget(ns, cs, arg) {
  cs.disabled = true;
  let servers = new Dispatcher(ns).servers;
  let player = ns.getPlayer();
  await ns.asleep(100);//make sure caller is done
  if (arg.length && servers.includes(arg[0])) {
    cs.disabled = false;
    cs.content = e => [...e, `Changing target to ${arg[0]}`];
    return arg[0];
  }
  cs.content = e => [...e, `Calculating`];
  let bins = servers.map(e => ns.getServer(e));
  servers = servers.map(e => ns.getServer(e));
  servers = servers.filter(e => !e.purchasedByPlayer);
  servers = servers.filter(e => player.skills.hacking >= e.requiredHackingSkill);
  let mm, m = -Infinity;
  for (let index = 0; index < servers.length; index++) {
    let i = servers[index];
    cs.content = e =>
      [...e.slice(0, e.length - 1), `Calculating ${i.hostname} (${index} out of ${servers.length})`];
    i.hackDifficulty = i.minDifficulty;
    i.moneyAvailable = i.moneyMax;
    for (let j of bins) {
      j.ramUsed = 0;
    }
    let h = ns.formulas.hacking;
    let st = strategize(ns, bins, i);
    let profit = calculateExpectedProfit(ns, i, st);
    profit /= h.hackTime(i, player) * 4 + 1000;
    if (profit > m) {
      m = profit;
      mm = i.hostname;
    }
    await ns.asleep(100);
  }
  cs.disabled = false;
  cs.content = e =>
    [...e, `Changing target to ${mm} because we expect ${ns.formatNumber(m * 1000)}/s profit`];
  return mm;
}
async function batcherLoop(ns, ts) {
  while (1) {
    let target = ns.read("hacktarget.txt") ?? "joesguns";
    let d = new Dispatcher(ns).servers.map(e => ns.getServer(e));
    let st = strategize(ns, d, ns.getServer(target), ts.lowRam ?? false);
    let t = send(ns, target, st);
    if (!st.length) {
      ts.batcherLoopMessage = `Huh, could not dispatch any threads. Funny...`;
      t = 10000;
    } else {
      ts.batcherLoopMessage = `Dispatched ${st.length} threads, with the first one being a ${st[0][0]}`;
      //what the first task is tells us if the server is prepped
    }
    ts.batcherLoopMessage += `\nWaiting ${new Date(t).toISOString().substring(11, 19)} for the batch to finish`;
    let profit = calculateExpectedProfit(ns, ns.getServer(target), st);
    ts.batcherLoopMessage += `\nExpected profit of current batch:${ns.formatNumber(profit)}`;
    ts.batchStartTime = Date.now();
    ts.batchEndTime = Date.now() + t;
    await ns.asleep(t);
    ns.run("buy.js");
    ns.run("purchase.js");
    await ns.asleep(1000);
  }
}
async function mainLoop(ns, ts) {
  while (1) {
    let progressBar = makeProgressBar(Date.now(), ts.batchStartTime, ts.batchEndTime, 32);
    ts.content = ts.batcherLoopMessage + "\n" + progressBar;
    await ns.asleep(50);
  }
}
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  compile(ns);
  if (!ns.fileExists("hacktarget.txt")) ns.write("hacktarget.txt", "joesguns", "w");
  let cs = new ConsoleState(function (input) {
    let [cmd, ...arg] = input.split(" ");
    let result = "see terminal";
    switch (cmd) {
      // case "buy":
      //   ns.run("buy.js");
      //   break;
      // case "purchase":
      //   ns.run("purchase.js");
      //   break;
      case "target":
        chooseTarget(ns, this, arg).then(e => {
          ns.write("hacktarget.txt", e, "w");
        });
        result = "";
        break;
      case "backdoor":
        ns.run("connectroute.js", 1, arg[0]);
        break;
      case "lowram":
        ts.lowRam = !(ts.lowRam ?? false);
        result = `Turning ${ts.lowRam ? "on" : "off"} low ram mode`;
        break;
      default:
        result = "";
    }
    this.content = e => [...e, "> " + input, ...(result ? [result] : [])];
  });
  let ts = new TextboxState();
  if (ns.args[0]) ts.lowRam=true;
  ns.printRaw(
    <div
      style={{
        position: "absolute",
        top: "35px",
        left: "1px",
        right: "1px",
        bottom: "0px"
      }}
    >
      <div style={{ height: "40%" }}>
        <Textbox state={ts} />
      </div>
      <div style={{
        height: "60%",
        borderTop: "1px solid #696969"
      }}>
        <Console state={cs} />
      </div>
    </div>
  );
  ns.ui.openTail();
  batcherLoop(ns, ts);
  await mainLoop(ns, ts);
}