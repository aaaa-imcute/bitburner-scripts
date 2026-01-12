// statically shuffled array of symbols.
const symbols = [
  "D",
  "C",
  "$",
  "?",
  "♥",
  "A",
  "C",
  "B",
  "C",
  "E",
  "B",
  "E",
  "C",
  "*",
  "D",
  "♥",
  "B",
  "A",
  "A",
  "A",
  "C",
  "A",
  "D",
  "B",
  "E",
  "?",
  "D",
  "*",
  "@",
  "♥",
  "B",
  "E",
  "?",
];
export class WHRNG {
  constructor(seed) {
    //MUST be all slot machine results from the last refresh.
    //The RNG has 6e12 states but it can only start from 30000 of them.
    const v = seed;
    this.s1 = v;
    this.s2 = v;
    this.s3 = v;
  }
  step() {
    this.s1 = (171 * this.s1) % 30269;
    this.s2 = (172 * this.s2) % 30307;
    this.s3 = (170 * this.s3) % 30323;
  }
  random() {
    this.step();
    return (this.s1 / 30269.0 + this.s2 / 30307.0 + this.s3 / 30323.0) % 1.0;
  }
}
function findSeed(seq) {
  //Computes the seed that would happen after a list of predicates are met.
  let p = [];
  for (let i = 0; i < 30000000; i++) {//i must be divisible by 200ms
    let rng = new WHRNG(i/1000);
    let nope = false;
    for (let j of seq) {
      if (!j(rng.random())) {
        nope = true;
        break;
      }
    }
    if (!nope) p.push(i/1000);
  }
  return p;
}
function getTable(index) {
  return [
    [
      symbols[(index[0] + symbols.length - 1) % symbols.length],
      symbols[(index[1] + symbols.length - 1) % symbols.length],
      symbols[(index[2] + symbols.length - 1) % symbols.length],
      symbols[(index[3] + symbols.length - 1) % symbols.length],
      symbols[(index[4] + symbols.length - 1) % symbols.length]
    ],
    [symbols[index[0]], symbols[index[1]], symbols[index[2]], symbols[index[3]], symbols[index[4]]],
    [
      symbols[(index[0] + 1) % symbols.length],
      symbols[(index[1] + 1) % symbols.length],
      symbols[(index[2] + 1) % symbols.length],
      symbols[(index[3] + 1) % symbols.length],
      symbols[(index[4] + 1) % symbols.length]
    ]
  ];
}
const aliases = (e => Object.fromEntries(Object.entries(e).flatMap(f => [...f[1]].map(g => [g, f[0]]))))({
  "$": "$Ss",
  "*": "*.Oo",
  "?": "?7Pp",
  "@": "@Qq",
  "A": "Aa",
  "B": "Bb",
  "C": "Cc",
  "D": "Dd",
  "E": "Ee",
  "♥": "♥Hh"
});
function reduceAlias(s) {
  //apply aliases and sanitize input
  return [...s].map(e => aliases[e] ?? "").join("");
}
function genSeq(out) {
  //Generates predicate sequence based on observables
  //Input:2D array of symbols on the middle row
  return out.flatMap(
    e => [f => true, ...[...e].map(
      f => g => symbols[Math.floor(g * symbols.length)] == f
    )]
  );
}
/**
 * @param {AutocompleteData} data - context about the game, useful when autocompleting
 * @param {string[]} args - current arguments, not including "run script.js"
 * @returns {string[]} - the array of possible autocomplete options
 */
export function autocomplete(data, [depth, ...args]) {//test:qhehp bhpbd
  let arr = [];
  for (let i of args) {
    if (i.length != 5) return [];
    arr.push(reduceAlias(i));
  }
  let pred = genSeq(arr);
  //console.log(arr);
  let seeds = findSeed(pred);
  // seeds = [24643.543];
  // console.log(findSeed(genSeq(seeds.map(e => {
  //   let rng = new WHRNG(e);
  //   let ret = [];
  //   for (let i = 0; i < 2; i++) {
  //     rng.random();
  //     let locks = [0, 0, 0, 0, 0].map(e => Math.floor(rng.random() * symbols.length));
  //     let item = "";
  //     item += locks.map(e => symbols[e]).join("");
  //     ret.push(item);
  //   }
  //   return ret;
  // })[0])));
  if (seeds.length == 0) return "not possible".split(" ");
  if (seeds.length >= 4) return "too much possibilities".split(" ");
  console.log(seeds);
  return seeds.map(e => {
    let rng = new WHRNG(e);
    let ret = [];
    for (let i = 0; i < depth; i++) {
      rng.random();
      let locks = [0, 0, 0, 0, 0].map(e => Math.floor(rng.random() * symbols.length));
      let item = "";
      item += locks.map(e => symbols[(e + symbols.length - 1) % symbols.length]).join("") + ",";
      item += locks.map(e => symbols[e]).join("") + ",";
      item += locks.map(e => symbols[(e + 1) % symbols.length]).join("");
      ret.push(item);
    }
    return ret;
  });
}
/** @param {NS} ns */
export async function main(ns) {

}