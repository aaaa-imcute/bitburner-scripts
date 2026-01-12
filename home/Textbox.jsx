export class TextboxState {
  #data = [];
  constructor() {}
  get content() {
    return this.#data;
  }
  set content(e) {
    if (typeof e == "function") this.#data = e(this.#data);
    else this.#data = e;
    this.forceUpdate?.();
  }
}
export function Textbox({ state }) {
  //i hate react
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  state.forceUpdate = forceUpdate;
  return state.element = <div>{state.content}</div>;
}