import { Textbox, TextboxState } from "./Textbox.jsx";
function transpose(obj) {
  let out = {};
  for (let [key, values] of Object.entries(obj)) {
    for (let v of values) {
      (out[v] ??= []).push(key);
    }
  }
  return out;
}
function reactJoin(arr, sep) {
  sep = sep ?? (() => ",");
  return arr.flatMap((e, i) => [e, ...(i == arr.length - 1 ? [] : [sep()])]);
}
/** @param {NS} ns */
export async function main(ns) {
  let factions = Object.values(ns.enums.FactionName);
  let f2a = Object.fromEntries(factions.map(e => [e, ns.singularity.getAugmentationsFromFaction(e)]));
  let a2f = transpose(f2a);//whoops i forgot ns.singularity.getAugmentationFactions when i wrote this
  let augs = Object.keys(a2f);
  let ts = new TextboxState();
  let stack = [], currentPage = () => makeAugmentationListPage(e => true, "Augmentations");
  let grafts = ns.args[0] ? ns.grafting.getGraftableAugmentations() : [];
  let graftTime = e => grafts.includes(e) ? ns.grafting.getAugmentationGraftTime(e) : 1e9;
  ns.printRaw(
    <div
      style={{
        position: "absolute",
        top: "35px",
        left: "1px",
        right: "1px",
        bottom: "0px",
        overflowY: "auto"
      }}
    >
      <Textbox state={ts} />
    </div>
  );
  function makePageTransition(page, text, i) {
    return <span key={i} onClick={() => {
      stack.push(currentPage);
      currentPage = page;
      ts.content = page();
    }}>{text}</span>;
  }
  function makeBackButton() {
    if (!stack.length) return "";
    return <span onClick={() => {
      let target = stack.pop();
      currentPage = target;
      ts.content = target();
    }}>Back</span>;
  }
  function makeAugmentationPage(aug) {
    return (
      <>
        {aug}<br />
        Factions:{
          (a2f[aug].length >= factions.length - 3) ? "(pretty much anywhere)" :
            reactJoin(a2f[aug].map(
              (e, i) => makePageTransition(() => makeFactionPage(e), e, i)
            ), () => ", ")
        }<br />
        Reputation requirement:{ns.formatNumber(ns.singularity.getAugmentationRepReq(aug))}<br />
        Price:{ns.formatNumber(ns.singularity.getAugmentationBasePrice(aug))}<br />
        {grafts.includes(aug) ? ["Grafting time:", ns.tFormat(graftTime(aug)), <br />] : ""}
        Dependencies:{
          (e => (e.length ? reactJoin(e.map(
            (f, i) => makePageTransition(() => makeAugmentationPage(f), f, i)
          ), () => ", ") : "(none)"))(
            ns.singularity.getAugmentationPrereq(aug)
          )
        }<br />
        Effects:{
          Object.entries(ns.singularity.getAugmentationStats(aug))
            .map(e => [e[0], 100 * (e[1] - 1)])
            .filter(e => e[1] != 0)
            .map((e, i) => (
              <div key={i}>
                {
                  makePageTransition(
                    () => makeAugmentationListPage(
                      f => ns.singularity.getAugmentationStats(f)[e[0]] != 1,
                      "Augmentations with " + e[0],
                      (f, g) =>
                        Math.log(ns.singularity.getAugmentationStats(g)[e[0]]) / graftTime(g) -
                        Math.log(ns.singularity.getAugmentationStats(f)[e[0]]) / graftTime(f)
                    ), e[0], 0)
                }
                : {(e[1] > 0 ? "+" : "") + ns.formatNumber(e[1])}%
              </div>
            ))
        }
        {makeBackButton()}
      </>
    )
  }
  function makeFactionPage(fac) {
    return (
      <>
        {fac}<br />
        Augmentations:{
          reactJoin(f2a[fac].map(
            (e, i) => makePageTransition(() => makeAugmentationPage(e), e, i)
          ), () => ", ")
        }<br />
        Favor:{ns.formatNumber(ns.singularity.getFactionFavor(fac))}<br />
        Enemies:{
          (e => (e.length ? reactJoin(e.map(
            (f, i) => makePageTransition(() => makeFactionPage(f), f, i)
          ), () => ", ") : "(none)"))(
            ns.singularity.getFactionEnemies(fac)
          )
        }<br />

        {makeBackButton()}
      </>
    )
  }
  function makeAugmentationListPage(cond, text, sort) {
    return [text, <br />, ...augs.filter(cond).toSorted(sort).map((e, i) => (
      <div key={i}>
        {makePageTransition(() => makeAugmentationPage(e), e, 0)}
      </div>
    )), makeBackButton()];
  }
  ts.content = currentPage();
  ns.ui.openTail();
  await new Promise(() => { });
}