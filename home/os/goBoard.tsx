function assertDefined<T>(x: T): asserts x is NonNullable<T> {
  if (x == null) throw new Error("unexpected undefined");
}
const MAX_SIZE = 19;//yep, we're doing c++-like stuff, such as fixed-size arrays!
const prng = (() => {
  let x = 2278998282;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return x;
  }
})();
const zobristTable = Array(MAX_SIZE * MAX_SIZE * 4).fill(0).map(prng);
export enum Color {
  empty = 0,
  broken = 1,
  black = 2,
  white = 3
}
function parseState(buf: Uint8Array, arr: string[]) {
  let s = arr.join("");
  for (let i = 0; i < s.length; i++) {
    switch (s[i]) {
      case ".":
        buf[i] = Color.empty;
        break;
      case "#":
        buf[i] = Color.broken;
        break;
      case "X":
        buf[i] = Color.black;
        break;
      case "O":
        buf[i] = Color.white;
        break;
    }
  }
}
function getHash(i: number, color: number, table: number) {
  if (color == Color.empty || color == Color.broken) return 0;
  let c = (color == Color.black) ? 0 : 1;
  return zobristTable[(i + (table * 2 + c) * MAX_SIZE * MAX_SIZE) % zobristTable.length];
}
function zobrist(arr: Uint8Array, table: number) {
  //computes the hash for a board from the ground up
  let ret = 0;
  for (let i = 0; i < arr.length; i++) {
    ret ^= getHash(i, arr[i], table);
  }
  return ret;
}
function pack(a: number, b: number) {
  return (BigInt(a) << 32n) | BigInt(b);
}
export function UCB(node: MCTSNode) {
  return (node.visits == 0) ? Infinity : (node.score / node.visits + Math.SQRT2 *
    Math.sqrt(Math.log(Math.max(1, node.parent?.visits ?? 1)) / node.visits))
}
//information needed to undo a move
type Move = {
  pos: number;
  turn: number;
  captured: number[];
  capturedParents: number[];
  capturedNexts: number[];
  capturedHeads: number[];
  capturedTails: number[];
  capturedSizes: number[];
  capturedLiberties: number[];
  touchedRoots: number[];
  prevLibs: number[];
  prevHash0: number;
  prevHash1: number;
  usp: number;//union stack pointer
};
type UnionChange = {
  child: number;
  root: number;
  sizeOld: number;
  tailOld: number;
};
export type MCTSNode = {
  parent: MCTSNode | undefined;
  move: number;//the previous move
  turn: number;//the current turn
  score: number;
  visits: number;
  children: MCTSNode[];
  iter: number;//next move consideration, out of bounds=finished
};
export class Board {
  //board state
  state: Uint8Array;
  len: number;
  size: number;
  turn: number;
  //neighbors
  numNeighbors: Uint8Array;
  neighbors: Uint16Array;
  //hashes
  hash0: number;
  hash1: number;
  history: Set<bigint>;
  //chains and liberties
  chainParent: Uint16Array;//eventually points to a chain representative
  chainNext: Int16Array;//normal linked list implementation
  chainHead: Uint16Array;
  chainTail: Uint16Array;
  chainSize: Uint16Array;
  chainLiberty: Uint16Array;//amount of liberties of a chain
  mark: Uint32Array;//prevents duplicate liberties
  markId: number = 1;//increment once per liberty recount for a group
  //undos
  moveStack: Move[] = [];
  unionStack: UnionChange[] = [];
  constructor(bs: string[], turn: string, history?: string[][]) {
    let len = bs.length, size = len * len;
    this.state = new Uint8Array(size);
    this.turn = (turn == "Black") ? Color.black : Color.white;
    this.len = len;
    this.size = size;
    this.numNeighbors = new Uint8Array(size);
    this.neighbors = new Uint16Array(size * 4);
    //write state
    parseState(this.state, bs);
    //compute neighbors (exclude broken cells)
    for (let y = 0; y < len; y++) {
      for (let x = 0; x < len; x++) {
        let i = x + y * len;
        let n: number[] = [];
        if (this.state[i] != Color.broken) {
          if (x != 0) n.push(i - 1);
          if (x != len - 1) n.push(i + 1);
          if (y != 0) n.push(i - len);
          if (y != len - 1) n.push(i + len);
          n = n.filter(e => this.state[e] != Color.broken);
        }
        this.numNeighbors[i] = n.length;
        for (let j = 0; j < n.length; j++) this.neighbors[i * 4 + j] = n[j];
      }
    }
    //compute hashes
    this.hash0 = zobrist(this.state, 0);
    this.hash1 = zobrist(this.state, 1);
    this.history = new Set([pack(this.hash0, this.hash1)]);
    if (history) {
      let temp = new Uint8Array(size);
      for (let i of history) {
        parseState(temp, i);
        this.history.add(pack(zobrist(temp, 0), zobrist(temp, 1)));
      }
    }
    //DSU stuff
    this.chainParent = new Uint16Array(size);
    this.chainNext = new Int16Array(size);
    this.chainHead = new Uint16Array(size);
    this.chainTail = new Uint16Array(size);
    this.chainSize = new Uint16Array(size);
    this.chainLiberty = new Uint16Array(size);
    this.mark = new Uint32Array(size);
    for (let i = 0; i < size; i++) this.createNewNode(i);
    //initialize chains
    for (let i = 0; i < size; i++) {
      if (this.state[i] != Color.black && this.state[i] != Color.white) continue;
      let num = this.numNeighbors[i];
      for (let j = 0; j < num; j++) {
        let n = this.neighbors[i * 4 + j];
        if (n != i + 1 && n != i + len) continue;//avoid redundant work
        if (this.state[n] != this.state[i]) continue;
        this.union(i, n, false);
      }
    }
    //initialize liberties
    let seen = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      if (this.state[i] != Color.black && this.state[i] != Color.white) continue;
      let r = this.findRoot(i);
      if (seen[r]) continue;
      seen[r] = 1;
      this.fixLiberties(r);
    }
  }
  createNewNode(i: number) {
    //creates new DSU node without connecting anything
    this.chainParent[i] = i;
    this.chainHead[i] = i;
    this.chainTail[i] = i;
    this.chainNext[i] = -1;
    this.chainSize[i] = 1;
  }
  findRoot(i: number) {
    while (this.chainParent[i] != i) i = this.chainParent[i];
    return i;
  }
  union(a: number, b: number, undoable?: boolean) {
    //merges two chains without checking color
    undoable ??= true;
    let ra = this.findRoot(a), rb = this.findRoot(b);
    if (ra == rb) return ra;
    if (this.chainSize[ra] < this.chainSize[rb]) {
      let t = ra;
      ra = rb;
      rb = t;
    }
    if (undoable) {
      this.unionStack.push({
        child: rb,
        root: ra,
        sizeOld: this.chainSize[ra],
        tailOld: this.chainTail[ra]
      });
    }
    if (ra === undefined || this.chainTail[ra] === undefined) throw new Error("undefined??");
    if (this.chainTail[ra] == this.chainHead[rb]) throw new Error("Would cause tight loop");
    this.chainParent[rb] = ra;
    this.chainNext[this.chainTail[ra]] = this.chainHead[rb];
    this.chainTail[ra] = this.chainTail[rb];
    this.chainSize[ra] += this.chainSize[rb];
    let seen = new Uint8Array(this.size), test = this.chainTail[ra];
    while (test != -1 && !seen[test]) {
      seen[test] = 1;
      test = this.chainNext[test];
    }
    if (test != -1) throw new Error("Would cause looped list");
    return ra;
  }
  undoUnion(p: number) {
    //undoes unions until stack top is p
    while (this.unionStack.length > p) {
      let data = this.unionStack.pop();
      assertDefined(data);
      let ra = data.root, rb = data.child, tail = data.tailOld;
      this.chainParent[rb] = rb;
      this.chainTail[ra] = tail;
      this.chainNext[tail] = -1;
      this.chainSize[ra] = data.sizeOld;
    }
  }
  fixLiberties(root: number) {
    let id = this.markId++, c = 0;
    let curr = this.chainHead[root];
    while (curr != -1) {
      let begin = curr << 2, end = begin + this.numNeighbors[curr];
      for (let i = begin; i < end; i++) {
        let n = this.neighbors[i];
        if (this.state[n] != Color.empty || this.mark[n] == id) continue;
        this.mark[n] = id;
        c++;
      }
      curr = this.chainNext[curr];
    }
    this.chainLiberty[root] = c;
    return c;
  }
  set(i: number, color: number) {
    let c = this.state[i];
    this.state[i] = color;
    this.hash0 ^= getHash(i, c, 0) ^ getHash(i, color, 0);
    this.hash1 ^= getHash(i, c, 1) ^ getHash(i, color, 1);
  }
  touchRoot(root: number, record: Move) {
    if (record.touchedRoots.includes(root)) return false;
    record.touchedRoots.push(root);
    record.prevLibs.push(this.chainLiberty[root]);
    return true;
  }
  deleteChain(root: number, turn: number, record: Move) {
    //delete chain and fix neighbor liberties and records that
    //also pass in the team whose liberties we want to fix
    let curr = this.chainHead[root];
    let seen: number[] = [];
    while (curr != -1) {
      let next = this.chainNext[curr];
      record.captured.push(curr);
      record.capturedParents.push(this.chainParent[curr]);
      record.capturedNexts.push(this.chainNext[curr]);
      record.capturedHeads.push(this.chainHead[curr]);
      record.capturedTails.push(this.chainTail[curr]);
      record.capturedSizes.push(this.chainSize[curr]);
      record.capturedLiberties.push(this.chainLiberty[curr]);
      this.set(curr, Color.empty);
      this.createNewNode(curr);
      let begin = curr << 2, end = begin + this.numNeighbors[curr];
      seen.length = 0;
      for (let i = begin; i < end; i++) {
        let n = this.neighbors[i];
        if (this.state[n] != turn) continue;
        let r = this.findRoot(n);
        if (seen.includes(r)) continue;
        seen.push(r);
        this.touchRoot(r, record);
        this.chainLiberty[r]++;//add one liberty per removed stone per chain
      }
      curr = next;
    }
  }
  makeMove(i: number) {
    let c = this.turn;
    let record: Move = {
      pos: i,
      turn: c,
      captured: [],
      capturedParents: [],
      capturedNexts: [],
      capturedHeads: [],
      capturedTails: [],
      capturedSizes: [],
      capturedLiberties: [],
      touchedRoots: [],
      prevLibs: [],
      prevHash0: this.hash0,
      prevHash1: this.hash1,
      usp: this.unionStack.length
    };
    this.turn = (this.turn == Color.black) ? Color.white : Color.black;
    if (i == -1) return record;//pass
    this.set(i, c);
    //fix chains
    this.createNewNode(i);
    let begin = i << 2, end = begin + this.numNeighbors[i], affectedChain = -1;
    for (let index = begin; index < end; index++) {
      let n = this.neighbors[index];
      switch (this.state[n]) {
        case Color.empty:
        case Color.broken:
          break;
        case c:
          //same color
          //merge with new node and fix liberties
          affectedChain = this.union(i, n);
          break;
        default:
          //the other color
          //one less liberty (but only if it hasn't been processed yet)
          let r = this.findRoot(n);
          if (!this.touchRoot(r, record)) break;
          if (--this.chainLiberty[r] > 0) break;
          //get rid of chain and fix liberties
          this.deleteChain(r, c, record);
      }
    }
    if (affectedChain == -1) affectedChain = this.findRoot(i);
    //only do these two at the end because the union may merge away roots
    this.touchRoot(affectedChain, record);
    this.fixLiberties(affectedChain);
    return record;
  }
  commitMove(record: Move) {
    if (record.pos != -1) this.history.add(pack(this.hash0, this.hash1));
    this.moveStack.push(record);
  }
  undoMove(record?: Move) {
    record ??= this.moveStack.pop();
    if (!record) throw new Error("Nothing to undo");
    if (record.pos == -1) {
      this.turn = record.turn;
      return;
    }
    this.history.delete(pack(this.hash0, this.hash1));
    this.hash0 = record.prevHash0;
    this.hash1 = record.prevHash1;
    this.undoUnion(record.usp);
    let pos = record.pos, c = record.turn, other = (c == Color.black) ? Color.white : Color.black;
    for (let i = 0; i < record.captured.length; i++) {
      this.state[record.captured[i]] = other;
      this.chainParent[record.captured[i]] = record.capturedParents[i];
      this.chainNext[record.captured[i]] = record.capturedNexts[i];
      this.chainHead[record.captured[i]] = record.capturedHeads[i];
      this.chainTail[record.captured[i]] = record.capturedTails[i];
      this.chainSize[record.captured[i]] = record.capturedSizes[i];
      this.chainLiberty[record.captured[i]] = record.capturedLiberties[i];
    }
    for (let i = 0; i < record.touchedRoots.length; i++) {
      this.chainLiberty[record.touchedRoots[i]] = record.prevLibs[i];
    }
    this.turn = record.turn;
    this.state[pos] = Color.empty;
    this.createNewNode(pos);
  }
  isValidMove(i: number, commit?: boolean, stricter?: boolean) {
    if (this.isFinished()) return false;
    if (i == -1 && (!stricter || (Math.random() < 0.1))) {
      //it is usually dumb to pass
      if (commit) this.commitMove(this.makeMove(i));
      return true;
    }
    if (i < 0 || i >= this.size) return false;
    if (this.state[i] != Color.empty) return false;
    if (stricter) {
      //also reject dumb moves
      //it is dumb to fill in true eyes
      let begin = i << 2, end = begin + this.numNeighbors[i], chain = -1, isTrueEye = true;
      for (let index = begin; index < end; index++) {
        let n = this.neighbors[index], c = this.state[n];
        if (c == this.turn) {
          let nr = this.findRoot(n);
          if (chain == -1) chain = nr;
          if (chain != nr) {
            isTrueEye = false;
            break;
          }
        } else {
          isTrueEye = false;
          break;
        }
      }
      if (isTrueEye) return false;
    }
    let record = this.makeMove(i), res = true, root = this.findRoot(i);
    if (this.chainLiberty[root] <= 0) res = false;
    if (res && this.history.has(pack(this.hash0, this.hash1))) res = false;
    if (res && stricter) {
      //it is dumb to cause your chain to be in atari
      if (this.chainLiberty[root] == 1) res = false;
    }
    if (commit && res) this.commitMove(record);
    else this.undoMove(record);
    return res;
  }
  isFinished() {
    if (this.moveStack.length < 2) return false;
    if (this.moveStack[this.moveStack.length - 1].pos != -1) return false;
    if (this.moveStack[this.moveStack.length - 2].pos != -1) return false;
    return true;
  }
  score(color: number) {
    let seen = new Uint8Array(this.size), ret = 0;
    for (let i = 0; i < this.size; i++) {
      if (seen[i]) continue;
      switch (this.state[i]) {
        case Color.broken:
          break;
        case Color.empty:
          let q = [i], c = Color.empty, a = 0;
          while (q.length) {
            let curr = q.pop();
            assertDefined(curr);
            if (seen[curr]) continue;
            seen[curr] = 1;
            a++;
            let begin = curr << 2, end = begin + this.numNeighbors[curr];
            for (let idx = begin; idx < end; idx++) {
              let n = this.neighbors[idx], nc = this.state[n];
              if (nc == Color.empty) q.push(n);
              else if (nc == Color.broken || nc == c) { }
              else if (c == Color.empty) c = nc;
              else a = -Infinity;
            }
          }
          if (a != -Infinity && c != Color.empty) ret += (c == color) ? a : -a;
          break;
        case color:
          ret++;
          break;
        default:
          //the other color
          ret--;
          break;
      }
    }
    return ret;
  }
  softScore(color: number) {
    let inf1 = new Float32Array(this.size), inf2 = new Float32Array(this.size), score!: number;
    let empty = [], baseScore = 0;
    for (let i = 0; i < this.size; i++) {
      switch (this.state[i]) {
        case Color.broken:
          inf1[i] = 0;
          break;
        case Color.empty:
          empty.push(i);
          break;
        case color:
          inf1[i] = 1;
          baseScore++;
          break;
        default:
          //the other color
          inf1[i] = -1;
          baseScore--;
          break;
      }
    }
    for (let it = 0; it < 20; it++) {
      score = baseScore;
      for (let i of empty) {
        let inf = 0;
        let begin = i << 2, num = this.numNeighbors[i];
        for (let idx = begin; idx < begin + num; idx++) {
          let n = this.neighbors[idx];
          inf += inf1[n];
        }
        inf2[i] = inf / num * 0.95;
        if (inf2[i] > 0.6 || inf2[i] < -0.6) score += inf2[i];
      }
      [inf1, inf2] = [inf2, inf1];
    }
    return score;
  }
  mcts(): [number, number, number, MCTSNode, [number, number, number, number]] {
    let end = performance.now() + 200, iterations = 0;
    let root: MCTSNode = {
      parent: undefined,
      move: -1,
      turn: this.turn,
      score: 0,
      visits: 0,
      children: [],
      iter: -1
    }
    let time: [number, number, number, number] = [0, 0, 0, 0];
    while (performance.now() < end) {
      //selection
      let start = performance.now();
      let curr = root, sp = this.moveStack.length, loops = 0;
      while (curr.iter < this.size && !this.isValidMove(curr.iter)) curr.iter++;
      while (curr.iter >= this.size && !this.isFinished()/* && curr.children.length*/) {
        let m = -Infinity, best!: MCTSNode;
        for (let i of curr.children) {
          let ucb = UCB(i);
          if (i.move == -1) ucb /= 1.5;//todo:remove this
          if (!Number.isFinite(ucb) || Number.isNaN(ucb)) throw new Error("bad math");
          if (ucb > m) {
            m = ucb;
            best = i;
          }
        }
        curr = best;
        if (!this.isValidMove(best.move)) throw new Error("invalid recorded move " + best.move);
        this.commitMove(this.makeMove(best.move));
        //get rid of invalid moves
        while (curr.iter < this.size && !this.isValidMove(curr.iter)) curr.iter++;
        loops++;
      }
      time[0] += performance.now() - start;
      if (curr.iter < this.size) {
        start = performance.now();
        //expansion
        let move = curr.iter++;
        if (!this.isValidMove(move)) throw new Error("invalid move " + move + " " + this.state[move]);
        this.commitMove(this.makeMove(move));
        let child: MCTSNode = {
          parent: curr,
          move: move,
          turn: this.turn,
          score: 0,
          visits: 0,
          children: [],
          iter: -1
        }
        curr.children.push(child);
        curr = child;
        time[1] += performance.now() - start;
        start = performance.now();
        //simulation
        let maxDepth = 20;
        while (!this.isFinished() && (--maxDepth) > 0) {
          do {
            move = Math.floor(Math.random() * (this.size + 1)) - 1;
          } while (!this.isValidMove(move, true, true)/* && --loops > 0*/);
        }
        time[2] += performance.now() - start;
      }
      start = performance.now();
      //backpropagation
      let score = -Math.tanh(this.softScore(curr.turn) / 10);//curr.turn is the next turn,so the wrong one
      // @ignore-infinite
      while (1) {
        curr.visits++;
        curr.score += score;
        score *= -1;
        if (!curr.parent) break;
        curr = curr.parent;
      }
      while (this.moveStack.length > sp) this.undoMove();
      time[3] += performance.now() - start;
      iterations++;
    }
    //if (!root.children.length) return [-1, iterations, 0];
    let m = -Infinity, best!: MCTSNode;
    for (let i of root.children) {
      if (m < i.visits) {
        m = i.visits;
        best = i;
      }
    }
    return [best.move, iterations, best.visits, root, time];
  }
}
// //webworker stuff
// let boards: Record<string, Board> = {};
// self.onmessage = e => {
//   let { id, boardId, type, data } = e.data, board;
//   if (type == "new") {
//     board = boards[boardId] = new Board(...(data as [string[], string, string[][]]));
//     self.postMessage({ id });
//     return;
//   } else {
//     board = boards[boardId];
//     if (type == "move") {
//       board.commitMove(board.makeMove(data));
//       self.postMessage({ id });
//     } else if (type == "calculate") {
//       let ret = board.mcts();
//       board.commitMove(board.makeMove(ret[0]));
//       self.postMessage({ id, ret });
//     }
//   }
// }