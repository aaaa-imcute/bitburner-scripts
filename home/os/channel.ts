export class Transaction<U, V> {
  promise: Promise<{ value: V }>;
  request: U;
  resolve!: (v: V) => void;
  reject!: (e?: any) => void;
  state: "pending" | "fulfilled" | "rejected" = "pending";
  constructor(request: U) {
    this.request = request;
    this.promise = new Promise((res: (value: { value: V }) => void, rej) => {
      this.resolve = e => {
        res({ value: e });
        this.state = "fulfilled";
      };
      this.reject = e => {
        rej(e);
        this.state = "rejected";
      };
    }).catch(e => {
      throw new Error("channel error", { cause: e })
    });
  }
}
export class Channel {
  //waits for old promises
  //ensures only one promise is flying
  transactions: Transaction<any, any>[] = [];
  get current() {
    return this.transactions[0];
  }
  async send<U, V>(req: U) {
    let wait = this.transactions[this.transactions.length - 1]?.promise ?? Promise.resolve();
    let t = new Transaction<U, V>(req);
    this.transactions.push(t);
    t.promise = t.promise.finally(() => this.transactions = this.transactions.filter(e => e != t));
    await wait;
    return t;
  }
}
function assertDefined<T>(x: T): asserts x is NonNullable<T> {
  if (x == null) throw new Error("unexpected undefined");
}
export class PromiseQueue<U> {
  responses: U[] = [];
  requests: ((v: { value: U }) => void)[] = [];
  promise!: PromiseLike<{ value: U }>;
  constructor() {
    this.replace();
  }
  replace() {
    let that = this;
    this.promise = {
      then(res, rej) {
        if (that.responses.length) {
          let v = that.responses.shift();
          assertDefined(v);
          return Promise.resolve().then(() => ({ value: v })).then(res, rej);
        }
        return (new Promise(r => that.requests.push(r)) as Promise<{ value: U }>).then(res, rej);
      }
    };
  }
  push(v: U) {
    let req = this.requests.shift();
    if (req) {
      req({ value: v });
      return;
    }
    this.responses.push(v);
  }
}