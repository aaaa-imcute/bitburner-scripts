/** @param {NS} ns */
export async function main(ns) {
  let a=ns.go.getBoardState();
  let b=ns.go.getMoveHistory();
  console.log(a,b);
}