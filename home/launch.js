/** @param {NS} ns */
export async function main(ns) {
  if (ns.args[0] == "home") ns.exit();
  let batch = globalThis[ns.args[0]];
  let start = performance.now(), delay = 0;
  for (let i of batch.tasks) {
    let time = performance.now() - start;
    if (time - delay > 50) {
      delay += 60;
      await ns.asleep(10);
    }
    ns.exec("batcher/" + i.type + ".js", i.server.hostname, {
      temporary: true,
      threads: Math.ceil(i.threads)
    }, batch.target, batch.timing[i.type] - time, i.threads);
  }
  batch.finish(start, delay, performance.now() - start);
}