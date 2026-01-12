/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(1.6);
  //costs ram
  window;
  document;
  ns.hack("n00dles");
  ns.grow("n00dles");
  ns.weaken("n00dles");
  ns.go.analysis.getChains();
  ns.go.analysis.getLiberties();
  ns.go.analysis.getValidMoves();
  ns.tprint(ns.getRunningScript().dynamicRamUsage);
  ns.tprint(ns.getRunningScript().threads);
}