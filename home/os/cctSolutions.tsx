function algorithmicStockTrader(k: number, arr: number[]) {
  //maximum money on day i with at most j transactions holding k stocks
  let dp = arr.map((e, i) => Array(k + 1).fill(0).map((f, j) => [-Infinity, -Infinity]));
  dp[0][0][0] = 0;
  dp[0][0][1] = -arr[0];
  for (let i = 1; i < arr.length; i++) {
    dp[i][0][0] = 0;
    dp[i][0][1] = Math.max(dp[i - 1][0][1], -arr[i]);
    for (let j = 1; j <= k; j++) {
      dp[i][j][0] = Math.max(dp[i - 1][j][0], dp[i - 1][j - 1][1] + arr[i]);//contemplate selling
      dp[i][j][1] = Math.max(dp[i - 1][j][1], dp[i - 1][j][0] - arr[i]);//contemplate buying
    }
  }
  return Math.max(0, ...dp[arr.length - 1].map(e => e[0]));
}
function arrayJumpingGame(arr: number[]) {
  let t = arr.map(e => Infinity);
  t[0] = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i; j < Math.min(arr.length, i + arr[i] + 1); j++) {
      t[j] = Math.min(t[j], t[i] + 1);
    }
  }
  let ans = t[arr.length - 1];
  if (ans == Infinity) return 0;
  return ans;
}
function generateIPAddresses(str: string, depth = 0): string[] {
  if (depth == 3) return ((str[0] != "0" || str.length == 1) && parseInt(str) <= 255) ? [str] : [];
  let ret = [];
  for (let choice = (str[0] == "0") ? 1 : 3; choice > 0; choice--) {
    if (
      str.length - choice > (3 - depth) * 3 ||
      str.length - choice < (3 - depth)
    ) continue;//impossible to finish
    if (choice == 3 && parseInt(str.slice(0, choice)) > 255) continue;
    ret.push(...generateIPAddresses(str.slice(choice), depth + 1).map(e => str.slice(0, choice) + "." + e));
  }
  return ret;
}
function hammingCodeErrorFinder(s: number[]) {
  let err = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i]) err ^= i;
  }
  return err;
}
export const cctSolutions = {
  "Algorithmic Stock Trader I": (arr: number[]) => algorithmicStockTrader(1, arr),
  "Algorithmic Stock Trader II": (arr: number[]) => algorithmicStockTrader(Math.floor(arr.length / 2), arr),
  "Algorithmic Stock Trader III": (arr: number[]) => algorithmicStockTrader(2, arr),
  "Algorithmic Stock Trader IV": ([k, arr]: [number, number[]]) => algorithmicStockTrader(k, arr),
  "Array Jumping Game": (arr: number[]) => +!!arrayJumpingGame(arr),
  "Array Jumping Game II": arrayJumpingGame,
  "Compression I: RLE Compression": (e: string) => {
    let c = e[0], a = 0, r = "";
    for (let i of e) {
      if (i != c) {
        if (a != 0) r += a.toString() + c;
        a = 0;
        c = i;
      }
      if ((++a) == 9) {
        r += a.toString() + c;
        a = 0;
      }
    }
    if (a != 0) r += a.toString() + c;
    return r;
  },
  "Compression II: LZ Decompression": (str: string) => {
    let ret = "";
    for (let i = 0; i < str.length;) {
      for (let j = i + parseInt(str[i++]); i <= j; i++) {
        ret += str[i];
      }
      let a = parseInt(str[i++]);
      if (a == 0) continue;
      let b = parseInt(str[i++]);
      for (let j = 0; j < a; j++) {
        ret += ret[ret.length - b];
      }
    }
    return ret;
  },
  "Compression III: LZ Compression": (str: string) => {
    function min(a: [number, string], b: [number, string]) {
      if (a[0] < b[0]) return a;
      return b;
    }
    let dp = Array(str.length + 1).fill(0).map(e =>
      [[Infinity, ""], [Infinity, ""]] as [[number, string], [number, string]]
    );
    dp[dp.length - 1] = [[0, ""], [0, ""]];
    for (let i = dp.length - 2; i >= 0; i--) {
      for (let j = 1; j <= Math.min(dp.length - 1 - i, 9); j++) {
        let c = str.slice(i, i + j);
        dp[i][0] = min(
          dp[i][0],
          (e => [e[0] + 1 + j, `${j}${c}${e[1]}`])(dp[i + j][1])
        );
        for (let k = 1; k <= Math.min(i, 9); k++) {
          if (str.slice(i - k, i + j - k) != c) continue;
          dp[i][1] = min(
            dp[i][1],
            (e => [e[0] + 2, `${j}${k}${e[1]}`])(dp[i + j][0])
          );
        }
      }
      dp[i][0] = min(dp[i][0], (e => [e[0] + 1, "0" + e[1]])(dp[i][1]));
      dp[i][1] = min(dp[i][1], (e => [e[0] + 1, "0" + e[1]])(dp[i][0]));
    }
    return min(...dp[0])[1];
  },
  "Encryption I: Caesar Cipher": ([str, a]: [string, number]) => {
    return String.fromCharCode(...[...str].map(e => e == " " ? 32 : 65 + (e.charCodeAt(0) - 65 - a + 26) % 26));
  },
  "Encryption II: Vigen\u00E8re Cipher": ([str, key]: [string, string]) => {
    return String.fromCharCode(...[...str].map((e, i) =>
      e == " " ? 32 : 65 + (e.charCodeAt(0) - 65 + (key.charCodeAt(i % key.length) - 65) + 26) % 26
    ));
  },
  "Find All Valid Math Expressions": ([digits, target]: [string, number]) => {
    let ret = [];
    (function helper(i, expr, total, last) {
      if (i == digits.length) {
        if (total == target) ret.push(expr);
        return;
      }
      for (let j = i + 1; j <= (digits[i] == "0" ? i + 1 : digits.length); j++) {
        let right = digits.slice(i, j), num = +right;
        if (!expr) helper(j, right, num, num);
        else {
          helper(j, expr + "+" + right, total + num, num);
          helper(j, expr + "-" + right, total - num, -num);
          helper(j, expr + "*" + right, total + (num - 1) * last, num * last);
        }
      }
    })(0, "", 0, 0);
    return ret;
  },
  "Find Largest Prime Factor": (num: number) => {
    let i = 2;
    for (; i * i <= num; i++) {
      while (num % i == 0) num /= i;
    }
    return (num == 1 ? (i - 1) : num);
  },
  "Generate IP Addresses": generateIPAddresses,
  "HammingCodes: Encoded Binary to Integer": (str: string) => {
    let s = [...str].map(e => +(e == "1")), t = BigInt(0);
    let err = hammingCodeErrorFinder(s);
    s[err] ^= 1;
    s = s.filter((e, i) => i & (i - 1));
    for (let i of s) {
      t <<= 1n;
      t |= BigInt(i);
    }
    return Number(t);
  },
  "HammingCodes: Integer to Encoded Binary": (_: number) => {
    let s = [], v = BigInt(_);
    while (v != 0n) {
      s.push(Number(v & 1n));
      v = v >> 1n;
    }
    s.reverse();
    for (let i = 0; i < s.length; i++) {
      if (i & (i - 1)) continue;
      s.splice(i, 0, 0);
    }
    let err = hammingCodeErrorFinder(s);
    while (err != 0) {
      let b = err & -err;
      err ^= b;
      s[b] ^= 1;
    }
    s[0] ^= s.reduce((e, f) => e ^ f);
    return s.join("");
  },
  "Merge Overlapping Intervals": (_: [number, number][]) => {
    let arr = [..._], ret = [];
    arr.sort((e, f) => f[0] - e[0]);
    while (arr.length) {
      let t = arr.pop(), k = arr[arr.length - 1];
      if (!t) throw new Error("impossible;this is just for typescript type checking");
      while (k && k[0] <= t[1]) {
        arr.pop();
        t[1] = Math.max(t[1], k[1]);
        k = arr[arr.length - 1];
      }
      ret.push(t);
    }
    return ret;
  },
  "Minimum Path Sum in a Triangle": (arr: number[][]) => {
    let dp = Array(arr.length + 1).fill(0);
    for (let i = arr.length - 1; i >= 0; i--) {
      for (let j = 0; j < arr[i].length; j++) {
        dp[j] = Math.min(dp[j], dp[j + 1]) + arr[i][j];
      }
    }
    return dp[0];
  },
  "Proper 2-Coloring of a Graph": ([len, edges]: [number, [number, number][]]) => {
    let color = Array(len).fill(-1), adj = Array(len).fill(0).map(e => new Set<number>());
    for (let i of edges) {
      adj[i[0]].add(i[1]);
      adj[i[1]].add(i[0]);
    }
    let nodes = Array(len).fill(0).map((e, i) => i);
    while (nodes.length) {
      debugger;
      let n = nodes[0], vis = new Set(), q = [n], curr;
      color[n] = 0;
      while ((curr = q.pop()) !== undefined) {
        if (vis.has(curr)) continue;
        vis.add(curr);
        for (let i of adj[curr]) {
          if (color[i] == -1) color[i] = 1 - color[curr];
          else if (color[i] == color[curr]) return [];
          q.push(i);
        }
      }
      nodes = nodes.filter(e => !vis.has(e));
    }
    return color;
  },
  "Sanitize Parentheses in Expression": (str: string) => {
    let left = 0, right = 0, ret = new Set();
    for (let i of str) {
      if (i == "(") left++;
      else if (i == ")") {
        if (left >= 1) left--;
        else right++;
      }
    }
    (function helper(i, b, l, r, s) {
      if (i == str.length) {
        if (b == 0 && l == 0 && r == 0) ret.add(s);
        return;
      }
      if (str[i] == "(") {
        if (l >= 1) helper(i + 1, b, l - 1, r, s);
        helper(i + 1, b + 1, l, r, s + "(");
        return;
      }
      if (str[i] == ")") {
        if (r >= 1) helper(i + 1, b, l, r - 1, s);
        if (b >= 1) helper(i + 1, b - 1, l, r, s + ")");
        return;
      }
      if (str[i] == "a") {
        helper(i + 1, b, l, r, s + "a");
        return;
      }
    })(0, 0, left, right, "");
    return [...ret];
  },
  "Shortest Path in a Grid": (arr: number[][]) => {
    let moves = arr.map(e => e.map(f => ""));
    let q: [number, number, string][] = [[arr.length - 1, arr[0].length - 1, ""]], head = 0;
    let vis = arr.map(e => e.map(f => false));
    while (head < q.length) {
      let [i, j] = q[head++];
      if (vis[i][j]) continue;
      vis[i][j] = true;
      for (let d of [
        [i - 1, j, "D"],
        [i + 1, j, "U"],
        [i, j - 1, "R"],
        [i, j + 1, "L"],
      ] as [number, number, string][]) {
        if (arr[d[0]]?.[d[1]] !== 0) continue;
        q.push(d);
        moves[d[0]][d[1]] = moves[d[0]][d[1]] || d[2];
        if (d[0] == 0 && d[1] == 0) {
          let ret = "";
          let i = 0, j = 0;
          while (i != arr.length - 1 || j != arr[0].length - 1) {
            let c = moves[i][j];
            ret += c;
            if (c == "D") i++;
            else if (c == "U") i--;
            else if (c == "R") j++;
            else if (c == "L") j--;
          }
          return ret;
        }
      }
    }
    return "";
  },
  "Spiralize Matrix": (arr: unknown[][]) => {
    //arr = arr.map((e, i) => e.map((f, j) => [i, j]));
    let ret = [];
    let top = 0, bottom = arr.length - 1, left = 0, right = arr[0].length - 1;
    // @ignore-infinite
    while (1) {
      for (let i = left; i <= right; i++)ret.push(arr[top][i]);
      top++;
      if (top > bottom) break;
      for (let i = top; i <= bottom; i++)ret.push(arr[i][right]);
      right--;
      if (left > right) break;
      for (let i = right; i >= left; i--)ret.push(arr[bottom][i]);
      bottom--;
      if (top > bottom) break;
      for (let i = bottom; i >= top; i--)ret.push(arr[i][left]);
      left++;
      if (left > right) break;
    }
    return ret;
  },
  "Square Root": (n: bigint) => {
    let x: bigint, y = n;
    do {
      x = y;
      y = (x + n / x) / 2n;
    } while (y < x);
    let t = x * x + x + 1n;
    if (n >= t) x++;
    return x;
  },
  "Subarray with Maximum Sum": (arr: number[]) => {
    let dp = [...arr];
    for (let i = 1; i < arr.length; i++) {
      dp[i] += Math.max(0, dp[i - 1]);
    }
    return Math.max(...dp);
  },
  "Total Ways to Sum": (i: number) => {
    let mem = Array(i + 1).fill(0);
    mem[0] = 1;
    for (let n = 1; n < mem.length; n++) {
      let q, c = 1;
      for (let k = 1; (q = k * (3 * k - 1) / 2) <= n; k++) {
        mem[n] += c * (mem[n - q] + (q + k > n ? 0 : mem[n - q - k]));
        c *= -1;
      }
    }
    return mem[i] - 1;
  },
  "Total Ways to Sum II": ([n, arr]: [number, number[]]) => {
    let dp = Array(n + 1).fill(0);
    dp[0] = 1;
    for (let j of arr) {
      for (let i = j; i <= n; i++) {
        dp[i] += dp[i - j];
      }
    }
    return dp[n];
  },
  "Unique Paths in a Grid I": ([a, b]: [number, number]) => {
    let dp = Array(a).fill(0).map(e => Array(b).fill(0));
    for (let i = 0; i < a; i++)dp[i][0] = 1;
    for (let i = 0; i < b; i++)dp[0][i] = 1;
    for (let i = 1; i < a; i++) {
      for (let j = 1; j < b; j++) {
        dp[i][j] = dp[i - 1][j] + dp[i][j - 1];
      }
    }
    return dp[a - 1][b - 1];
  },
  "Unique Paths in a Grid II": (arr: number[][]) => {
    let a = arr.length, b = arr[0].length;
    let dp = Array(a).fill(0).map(e => Array(b).fill(0));
    let f = 0;
    for (let i = 0; i < a; i++)dp[i][0] = 1 - (f ||= arr[i][0]);
    f = 0;
    for (let i = 0; i < b; i++)dp[0][i] = 1 - (f ||= arr[0][i]);
    for (let i = 1; i < a; i++) {
      for (let j = 1; j < b; j++) {
        dp[i][j] = arr[i][j] ? 0 : dp[i - 1][j] + dp[i][j - 1];
      }
    }
    return dp[a - 1][b - 1];
  },
};
Object.freeze(cctSolutions);