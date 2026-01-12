import { dynamicExport, NSLike } from "./os.tsx";
import { Board, Color } from "./goBoard.tsx";
// import * as Comlink from "./comlink/comlink.ts";
// import type { WorkerAPI } from "./goWorker.tsx";
import { displayBoardState, showTree } from "./goUI.tsx";
function diff(a: unknown, b: unknown) {
  //object or pair of objects->difference
  //false->lack of difference
  if (a && b && typeof a == "object" && typeof b == "object") {
    let ret: Record<string, unknown> = {};
    for (let i of new Set([...Object.keys(a), ...Object.keys(b)])) {
      let d = diff((a as any)[i], (b as any)[i]);
      if (d) ret[i] = d;
    }
    return Object.keys(ret).length ? ret : false;
  }
  if (a === b) return false;
  return [a, b];
}
async function payload(ns: NSLike) {
  // let gist = "https://gist.githubusercontent.com/aaaa-imcute/" +
  //   "aba390599fe82ab9a583331e7e6b1a4a/raw/fae36d657d1aa0843b2e1bcc542c8243e3077b17/";
  // const worker = new Worker(
  //   new URL("./goWorker.js", gist),
  //   { type: "module" }
  // );
  //const api = Comlink.wrap<Comlink.Remote<WorkerAPI>>(worker);
  let board = new Board(await ns.go.getBoardState(), ns.go.getCurrentPlayer(), ns.go.getMoveHistory());
  //console.log(board.isValidMove(45));
  //let state = structuredClone(board);
  while (1) {
    let [move, count, score, root, time] = board.mcts();
    let next: {
      type: "move" | "pass" | "gameOver";
      x: number | null;
      y: number | null;
    };
    let sum = time[0] + time[1] + time[2] + time[3];
    let timeAlloc = time.map(e => ns.formatPercent(e / sum)).join();
    board.commitMove(board.makeMove(move));
    // let tree = displayBoardState(board, root);
    // let win = await showTree(tree, id => ns.os.getTail(id));
    // win.onClose = () => {
    //   win.destroy();
    //   ns.exit();
    // }
    if (move == -1) {
      ns.toast("pass " + timeAlloc);
      next = await ns.go.passTurn();
    } else {
      let x = Math.floor(move / board.len);
      let y = move % board.len;
      ns.toast(count + " " + score + " " + timeAlloc);
      next = await ns.go.makeMove(x, y);
    }
    //next = await ns.go.opponentNextTurn(true, ns.go.getCurrentPlayer() == "Black");
    if (next.type == "pass") {
      board.commitMove(board.makeMove(-1));
    } else if (next.type == "gameOver") {
      break;
    } else {
      if (next.x === null || next.y === null) throw new Error();
      board.commitMove(board.makeMove(next.y + next.x * board.len));
    }
    // ns.go.analysis.clearAllPointHighlights();
    // for (let i = 0; i < board.size; i++) {
    //   let c = board.state[i], color;
    //   if (c == Color.black) color = "#000000";
    //   else if (c == Color.white) color = "#FFFFFF";
    //   else color = "hp";
    //   if (c != Color.empty) {
    //     let x = Math.floor(i / board.len);
    //     let y = i % board.len;
    //     ns.go.analysis.highlightPoint(x, y, color, board.chainParent[i] + " " + board.chainNext[i]);
    //   }
    // }
  }
  // while (1) {
  //   await ns.asleep(200);
  // }
}
export async function main(ns: NS) {
  ns.ramOverride(2.6);
  dynamicExport(ns, () => payload);
}