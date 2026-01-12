import { dynamicExport } from "os/os.tsx";

/** @param {NS} ns */
async function payload(ns) {
  let win = await ns.os.getTail();
  let i = 0;
  while (1) {
    win.setBody(++i);
    win.render();
    //if (i & 32) win.open();
    //else win.close();
    win.setMinimized((i & 16) == 0);
    //moves the window so that one of its extremities is at the center,
    //and the other moves in the path of an ellipse
    //there is a minimum width a window must have, though.
    // let pointA = [
    //   400 * Math.cos(i / 10),
    //   400 * Math.sin(i / 10),
    // ];
    let pointA=[700,700];
    let pointB = [0, 0];
    for (let j = 0; j < 2; j++) {
      if (pointA[j] > pointB[j]) {
        [pointA[j], pointB[j]] = [pointB[j], pointA[j]];
      }
    }
    win.move(
      innerWidth / 2 + pointA[0],
      innerHeight / 2 + pointA[1]
    );
    win.resize(
      pointB[0] - pointA[0],
      pointB[1] - pointA[1]
    );
    if (i > 200) {
      win.destroy();
      ns.exit();
    }
    await ns.sleep(10000);
  }
}
export async function main(ns) {
  ns.ramOverride(2.6);
  dynamicExport(ns, () => payload);
}