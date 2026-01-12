/** @param {NS} ns */
let vis = [];
async function s(ns, t, n) {
  for (let i of ns.scan(t)) {
    if (vis.includes(i)) continue;
    vis.push(i);
    ns.tprint(n+i);
    await s(ns, i, n + " ");
  }
}
export async function main(ns) {
  vis = ["home"];
  await s(ns, "home", "");
}