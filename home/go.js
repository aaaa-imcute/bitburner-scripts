class BoardState {
  constructor(bs) {
    this.chains = new Map();
    if (bs) {
      this.w = bs.length;
      this.h = bs[0].length;
      this.board = bs.join("");
    }
    this.parent = null;
  }
  static copy(bs, board, keepParent = false) {
    let ret = new this("");
    ret.w = bs.w;
    ret.h = bs.h;
    if (board) ret.board = board;
    else ret.board = bs.board;
    ret.parent = keepParent ? bs.parent : bs;
    return ret;
  }
  outOfBounds(x, y) {
    return x < 0 || x >= this.w || y < 0 || y >= this.h;
  }
  getColor(x, y) {
    if (this.outOfBounds(x, y)) return "#";
    return this.board[x * this.w + y];
  }
  setColor(x, y, c) {
    if (this.outOfBounds(x, y) || this.getColor(x, y) == "#") return BoardState.copy(this);
    let i = x * this.w + y;
    return BoardState.copy(this, this.board.slice(0, i) + c + this.board.slice(i + 1));
  }
  static getNeighbors([x, y]) {
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  }
  getChain(x, y) {
    let ret = new Set();
    ret.liberties = new Set();//only makes sense when the chain is not empty-colored
    if (this.getColor(x, y) == "#") return ret;
    let key = [x, y];
    if (this.chains.has(key.join())) return this.chains.get(key.join());
    let q = [key], vis = new Set(), color = this.getColor(x, y), cur;
    while (cur = q.pop()) {
      if (vis.has(cur.join())) continue;
      vis.add(cur.join());
      let c = this.getColor(...cur);
      if (c == ".") {
        ret.liberties.add(cur);
      }
      if (c != color) continue;
      ret.add(cur);
      for (let i of BoardState.getNeighbors(cur)) {
        if (this.outOfBounds(...cur)) continue;
        q.push(i);
      }
    }
    for (let i of ret) {
      this.chains.set(i.join(), ret);
    }
    return ret;
  }
  static getOtherPlayer(c) {
    if (c == "X") return "O";
    if (c == "O") return "X";
    EnotAPlayer();
  }
  deleteCapturedPieces(x, y) {
    if (this.outOfBounds(x, y) || this.getColor(x, y) == "#") return BoardState.copy(this, this.board, true);
    let c = this.getColor(x, y);
    let remove = BoardState.getNeighbors([x, y])
      .filter(e => this.getColor(...e) == BoardState.getOtherPlayer(c))
      .map(e => this.getChain(...e))
      .filter(e => !e.liberties.size)
      .reduce((e, f) => ([...f].map(g => e.add(g[0] * this.w + g[1])), e), new Set());
    return BoardState.copy(this, [...this.board].map((e, i) => remove.has(i) ? "." : e).join(""), true);
  }
  isValidMove(x, y, c) {
    if (this.getColor(x, y) != ".") return false;
    let ret = this.setColor(x, y, c).deleteCapturedPieces(x, y), cur = ret;
    if (!ret.getChain(x, y).liberties.size) return false;
    do {
      cur = cur.parent;
      if (ret.board == cur?.board) return false;
    } while (cur);
    return true;
  }
  validMoves(c) {
    let ret = [];
    for (let i = 0; i < this.w; i++) {
      for (let j = 0; j < this.h; j++) {
        if (this.isValidMove(i, j, c)) ret.push([i, j]);
      }
    }
    return ret;
  }
  isFullySurrounded(chain) {
    //only makes sense when the chain is empty-colored
    if (chain.owner) {
      return (chain.owner == "#") ? false : chain.owner;
    }
    let color;
    for (let i of chain) {
      for (let j of BoardState.getNeighbors(i)) {
        let c = this.getColor(...j);
        if (c == "#" || c == ".") continue;
        if (!color) {
          color = c;
          continue;
        }
        if (color != c) {
          chain.owner = "#";
          return false;
        }
      }
    }
    chain.owner = color;
    return color;
  }
  score(color) {
    //gives the score difference
    let score = 0;
    for (let i = 0; i < this.w; i++) {
      for (let j = 0; j < this.h; j++) {
        let co = this.getColor(i, j);
        if (co == "#") continue;
        if (co == ".") {
          let ch = this.getChain(i, j);
          let c = this.isFullySurrounded(ch);
          if (c) score += (c == color) ? 1 : -1;
          continue;
        }
        score += (co == color) ? 1 : -1;
      }
    }
    return score;
  }
  represent() {
    //unique representation
    //height not needed cuz board length is going to be difficult
    //(width also not needed since the boards are square)
    //seperators not needed because numbers and board states look quite different
    return `${this.w}${this.board}${this.parent?.represent() ?? ""}`;
  }
  simulateMove(m, c) {
    //keep track of color yourself
    if (!m || m[0] == -1 || m[1] == -1) return BoardState.copy(this);//pass
    return this.setColor(...m, c).deleteCapturedPieces(...m);
  }
  // static minimaxCache = new Map();
  // minimax(color, validMoves, depth = Infinity, alpha = -Infinity, beta = Infinity) {
  //   let moves = validMoves(this, color);//TODO:passing
  //   let key = color + this.represent();
  //   if (!moves.length) {
  //     let score = this.score(color);
  //     let r = { score: score, depth: Infinity, upperBound: score };
  //     BoardState.minimaxCache.set(key, r);
  //     return structuredClone(r);
  //   }
  //   if (BoardState.minimaxCache.has(key)) {
  //     let mem = BoardState.minimaxCache.get(key);
  //     if (mem.depth >= depth) return mem;
  //   }
  //   //after this check,it is always okay to write to the cache, because
  //   //we know that there isn't an entry bigger than or equal to the depth
  //   //and the next move is only missing if the game already ended or
  //   //if the current call has a depth of zero
  //   if (depth == 0) {
  //     let score = this.score(color);
  //     let r = { score: score, depth: 0, upperBound: score };
  //     BoardState.minimaxCache.set(key, r);
  //     return structuredClone(r);
  //   }
  //   let ret = -Infinity, best;
  //   for (let i of moves) {
  //     let n = this.setColor(...i, color).deleteCapturedPieces(...i);
  //     let { score } = n.minimax(BoardState.getOtherPlayer(color), validMoves, depth - 1, -beta, -alpha);
  //     score *= -1;
  //     if (score <= ret) continue;
  //     ret = score;
  //     best = i;
  //     alpha = Math.max(alpha, ret);
  //     if (0&&alpha >= beta) {
  //       let r = {
  //         score: ret,
  //         depth: depth,
  //         upperBound: Infinity
  //       };
  //       //TODO:implement memoization of intervals and an option to turn memoization off
  //       return structuredClone(r);
  //     }
  //   }
  //   let r = {
  //     score: ret,
  //     nextMove: best,
  //     depth: depth,
  //     upperBound: ret
  //   };
  //   BoardState.minimaxCache.set(key, r);
  //   return structuredClone(r);
  // }
}
function badGoBot(state, validMoves) {
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}
function loopCounter(max) {
  let loops = 0;
  return function () {
    if (++loops > max) throw ">:(";
    return true;
  }
}
function mcts(state, color) {
  let cexp = Math.SQRT2;
  let iterations = 200, root = BoardState.copy(state, state.board, true);
  let validMoves = e => e.validMoves(e.color).concat((e.board == e.parent?.board) ? [] : [[-1, -1]]);
  let activation = e => Math.tanh(e);
  root.color = color;
  root.children = [];
  root.moves = validMoves(root);
  root.ratio = [0, 0];
  for (let i = 0; i < iterations; i++) {
    let stack = [];
    //selection
    let curr = root, counter = loopCounter(1000);
    while (counter() && !curr.moves.length && curr.children.length) {
      stack.push(curr);
      let m = -Infinity, best;
      for (let j of curr.children) {
        if (j.ratio[1] == 0) {
          m = Infinity;
          best = j;
          break;
        }
        let ucb = j.ratio[0] / j.ratio[1] + cexp * Math.sqrt(Math.log(curr.ratio[1] + 1) / j.ratio[1]);
        if (ucb > m) {
          m = ucb;
          best = j;
        }
      }
      curr = best;
    }
    stack.push(curr);
    if (curr.moves.length) {
      //expansion
      let m = curr.moves.pop();
      let n = curr.simulateMove(m, curr.color);
      n.color = BoardState.getOtherPlayer(curr.color);
      n.children = [];
      n.moves = validMoves(n);
      n.ratio = [0, 0];
      n.lastMove = m;
      curr.children.push(n);
      curr = n;
      stack.push(curr);
      //simulation
      let moves;
      while (counter() && (moves = validMoves(curr)).length) {
        let m = badGoBot(curr, moves);
        let n = curr.simulateMove(m, curr.color);
        n.color = BoardState.getOtherPlayer(curr.color);
        curr = n;
      }
    }
    //backpropagation
    let score = activation(curr.score(stack[stack.length - 1].color));
    while (curr = stack.pop()) {
      curr.ratio[1]++;
      curr.ratio[0] += score;
      score *= -1;
    }
  }
  if (!root.children.length) return [-1, -1];//no valid moves
  let m = -Infinity, best;
  for (let i of root.children) {
    let s = i.ratio[1];
    if (s > m) {
      m = s;
      best = i;
    }
  }
  return best.lastMove;
}
/** @param {NS} ns */
export async function main(ns) {
  ns.go.analysis.clearAllPointHighlights();
  //BoardState.minimaxCache.clear();
  let state = new BoardState(ns.go.getBoardState());
  // let color = ns.go.getCurrentPlayer() == "Black" ? "X" : "O";
  // let m = mcts(state, color);
  // if (m[0] == -1) ns.toast("pass");
  // else {
  //   ns.go.analysis.highlightPoint(...m, "hack");
  //   ns.toast(m.join());
  // }
  while (1) {
    let color = ns.go.getCurrentPlayer() == "Black" ? "X" : "O";
    let m = mcts(state, color);
    if (m[0] == -1) ns.go.passTurn(color == "O");
    else ns.go.makeMove(...m, color == "O");
    state = state.simulateMove(m, color);
    if (state.board != new BoardState(ns.go.getBoardState()).board) throw "bad";
    let { type, x, y } = await ns.go.opponentNextTurn();
    if (type == "gameOver") ns.exit();
    if (type == "pass") state = state.simulateMove([-1, -1], BoardState.getOtherPlayer(color));
    else state = state.simulateMove([x, y], BoardState.getOtherPlayer(color));
    if (state.board != new BoardState(ns.go.getBoardState()).board) throw "bad";
  }
}