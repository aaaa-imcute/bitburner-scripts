import { dynamicExport, NSLike } from "./os.tsx";
import { cctSolutions } from "./cctSolutions.tsx";

function typeCorrectEntries<T extends Object>(obj: T): Array<[keyof T, T[keyof T]]> {
  //ts isn't smart enough to figure out you can use the first item
  //of an item of the result of Object.entries of an object to index that object
  return Object.entries(obj) as any;
}
function appendLog(t: ReactNode) {
  return (e: ReactNode) => <>{e}{e ? <br /> : ""}{t}</>;
}
async function getAllServers(ns: NSLike, server = "home"): Promise<string[]> {
  let a = await ns.scan(server), ret = [server];
  if (server != "home") a.shift();
  for (let i of a) {
    ret.push(...await getAllServers(ns, i));
  }
  return ret;
}
async function payload(ns: NSLike) {
  let win = await ns.os.getTail();
  win.setTitle("Coding Contract Solver");
  win.onClose = () => {
    win.destroy();
    ns.exit(0, true);
  };
  let allCctTypes = typeCorrectEntries(ns.enums.CodingContractName).map(e => e[1]);
  let cctTypes = [];
  let file = ns.read("os/cctTime.txt");
  if (file) {
    //skip testing solutions
    cctTypes = file.split("\n").map(e => e.split(": ")).filter(e => !e[1].includes("∞"));
  } else {
    //test solutions
    let rec: [CodingContractName, number][] = [];
    for (let i of allCctTypes) {
      let sol: (data: unknown) => unknown = (cctSolutions as any)[i];
      if (!sol) {
        win.setBody(appendLog(`Missing solution for ${i}. Skipping...`));
        rec.push([i, Infinity]);
        continue;
      }
      let amount = 0, time = 0, bad = false;
      for (let repeat = 0; !bad && repeat < 20; repeat++) {
        let start = performance.now();
        while (performance.now() - start < 50) {
          let fn = await ns.codingcontract.createDummyContract(i);
          let cct = await ns.codingcontract.getContract(fn);
          if (cct.type != i) {
            //https://github.com/bitburner-official/bitburner-src/pull/2399
            continue;
          }
          let t = performance.now(), reward;
          try {
            let ans = sol(cct.data);
            time += performance.now() - t;
            reward = await ns.codingcontract.attempt(ans, fn);
          } catch (e) {
            win.setBody(appendLog(`Buggy solution for ${i}, making error ${e}. Skipping...`));
            bad = true;
            break;
          }
          if (!reward) {
            win.setBody(appendLog(`Incorrect solution for ${i}. Skipping...`));
            bad = true;
            break;
          }
          amount++;
        }
        await ns.asleep(10);//avoid making lag
      }
      if (bad) {
        rec.push([i, Infinity]);
      } else {
        win.setBody(appendLog(
          `Correct solution for ${i}, taking ${(time / amount * 1000).toPrecision(4)} microseconds.`
        ));
        cctTypes.push(i);
        rec.push([i, time / amount * 1000]);
      }
    }
    rec.sort((a, b) => b[1] - a[1]);
    ns.write("os/cctTime.txt", rec.map(
      e => e[0] + ": " + ns.formatNumber(e[1]) + " microseconds"
    ).join("\n"), "w");
  }
  win.setBody(appendLog(
    `All solutions verified. Missing ${allCctTypes.length - cctTypes.length} solutions.`
  ));
  while (1) {
    //solve contracts
    let servers = await getAllServers(ns);
    for (let i of servers) {
      for (let j of (await ns.ls(i)).filter(e => e.endsWith(".cct"))) {
        let cct = await ns.codingcontract.getContract(j, i);
        let sol = (cctSolutions as any)[cct.type];
        if (!sol) continue;
        let ans = sol(cct.data);
        let reward = await ns.codingcontract.attempt(ans, j, i);
        if (reward) {
          win.setBody(appendLog(`${cct.type} on ${i} (${j}) solved correctly, ${reward}`));
        } else {
          win.setBody(appendLog(
            `${cct.type} on ${i} (${j}) solved incorrectly, ${cct.numTriesRemaining()} tries left!`
          ));
        }
      }
    }
    //1/4 chance of generating new coding contract every this much time
    //split the sleep so the application can be closed faster
    for (let i = 0; i < 3000; i++) {
      await ns.asleep(200);
    }
  }
}
export async function main(ns: NS) {
  ns.ramOverride(2.6);
  dynamicExport(ns, () => payload);
}