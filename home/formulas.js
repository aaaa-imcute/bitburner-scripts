/** @param {NS} ns */
function getRelMoneyHacked(s,p){
  const b=240,dm=1-s.hackDifficulty/100,sm=1-(s.requiredHackingSkill-1)/p.skills.hacking;
  const bn=1;//bitnode stuff
  const ret=dm*sm*p.mults.hacking_money*bn/b;
  return Math.min(1,Math.max(ret,0));
}
export async function main(ns) {

}