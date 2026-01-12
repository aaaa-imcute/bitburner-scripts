import { TailWindow } from "./tailwindow.tsx";
import { Board, Color, MCTSNode, UCB } from "./goBoard.tsx";
type TreeNode = {
  parent: TreeNode | undefined;
  children: TreeNode[];
  title: string;
  body: string[];
}
export function displayBoardState(board: Board, node: MCTSNode) {
  if (node.parent) board.commitMove(board.makeMove(node.move));
  let title = `${Math.atanh(node.score / node.visits).toPrecision(2)}` +
    ` ${UCB(node).toPrecision(2)} (${node.visits}) ${node.iter}`;
  let body: string[][] = Array(board.len).fill(0).map(e => Array(board.len).fill("."));
  for (let i = 0; i < board.size; i++) {
    let x = Math.floor(i / board.len);
    let y = board.len - i % board.len - 1;
    let s = board.state[i], c: string;
    if (s == Color.empty) c = ".";
    else if (s == Color.black) c = "X";
    else if (s == Color.white) c = "O";
    else c = "#";
    body[y][x] = c;
  }
  let ret: TreeNode = {
    parent: undefined,
    children: [],
    title: title,
    body: body.map(e => e.join(""))
  };
  for (let i of node.children.toSorted((e, f) => /*UCB(f) - UCB(e)*/f.visits - e.visits).slice(0, 3)) {
    ret.children.push(displayBoardState(board, i));
  }
  if (node.parent) board.undoMove();
  return ret;
}
let mark = 0, windows: TailWindow[] = [];
export async function showTree(
  node: TreeNode,
  makeWindow: (id: string) => Promise<TailWindow>,
  x: number = innerWidth / 2,
  depth: number = 0
) {
  let win = await makeWindow(`${++mark}`);
  win.onClose = () => win.destroy();
  win.onRerun = () => {
    for (let i of windows) i.destroy();
    showTree(node, makeWindow);
  };
  win.setTitle(node.title);
  win.setBody(node.body.flatMap((e, i) => [...(i == 0 ? [] : [<br key={i - 1} />]), e]));
  if (win.titleState.ref?.current) win.titleState.ref.current.style.fontSize = "8px";
  win.setFontSize("8px");
  win.resize(150, 120);
  win.move(x, depth * 150);
  if (depth < 3) {
    let offset = -1;
    for (let i of node.children) {
      await showTree(i, makeWindow, x + (offset++) * innerWidth * Math.pow(1 / 3, depth) / 4, depth + 1);
    }
  }
  windows.push(win);
  return win;
}