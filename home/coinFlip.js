/*
 * very bad RNG, meant to be used as introduction to RNG manipulation. It has a
 * period of 1024.
 */
class RNG0 {

  constructor() {
    this.x = 0;
    this.m = 1024;
    this.a = 341;
    this.c = 1;
    //this.reset();
  }

  step() {
    this.x = (this.a * this.x + this.c) % this.m;
  }

  random() {
    this.step();
    return this.x / this.m;
  }

  reset(seq) {
    //Computes the seed that would happen after a list of predicates are met.
    let p = [];
    for (let i = 0; i < this.m; i++) {
      this.x = i;
      let nope = false;
      for (let j of seq) {
        if (!j(this.random())) {
          nope = true;
          break;
        }
      }
      if (!nope) p.push(this.x);
    }
    if (p.length) this.x = p[0];
    return p;
  }
}
/** @param {NS} ns */
export async function main(ns) {
  let badRNG = new RNG0();
  let r = badRNG.reset([...ns.args[0]].map(e => e == "H" ? (f => f < 0.5) : (f => f >= 0.5)));
  ns.tprint("Possible seeds: ",r);
  if(r.length==0){
    ns.tprint("Contradiction");
  }else if(r.length>1){
    ns.tprint("Need more data");
  }else{
    ns.tprint(Array(30).fill(0).map(e=>badRNG.random()<0.5?"H":"T").join(""));
  }
}