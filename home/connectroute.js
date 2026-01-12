/** @param {NS} ns */
function s(ns, vis, t) {
  for (let i of ns.scan(t)) {
    if (vis.includes(i)) continue;
    vis.push(i);
    s(ns, vis, i);
  }
}
/** @param {NS} ns */
function r(ns, vis, t, d) {
  vis[t] = d;
  for (let i of ns.scan(t)) {
    if (vis[i] > d + 1) r(ns, vis, i, d + 1);
  }
}
/** @param {NS} ns */
export async function main(ns) {
  ns.tprint(ns.scan("home"));
  let vis = ["home"];
  s(ns, vis, "home");
  vis = Object.fromEntries(vis.map(e => [e, Infinity]));
  r(ns, vis, ns.args[0], 0);
  let dist = vis["home"], c = "home", l = [];
  while (dist > 0) {
    for (let i of ns.scan(c)) {
      if (vis[i] == dist-1) {
        dist = vis[i];
        c = i;
        l.push(c);
        break;
      }
    }
  }
  for(let i of l){
    ns.singularity.connect(i);
  }
  await ns.singularity.installBackdoor();
  ns.tprint("backdoor installed");
  ns.singularity.connect("home");
  //ns.tprint("connect "+l.join(";connect "));
}