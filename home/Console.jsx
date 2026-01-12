export class ConsoleState {
  #data = [];
  constructor(callback) {
    this.callback = callback.bind(this);
  }
  get content() {
    return this.#data;
  }
  set content(e) {
    if (typeof e == "function") this.#data = e(this.#data);
    else this.#data = e;
    this.forceUpdate?.();
  }
}
export function Console({ state }) {
  //i hate react
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  state.forceUpdate = forceUpdate;
  const containerRef = React.useRef(null);
  React.useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.content]);
  const [input, setInput] = React.useState("");
  return state.element = (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflowY: "auto",
        font: "inherit",
        color: "inherit"
      }}
    >
      {state.content.map((e, i) => <div key={i}>{e}</div>)}
      {"> "}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key != "Enter") return;
          if (state.disabled) return;
          state.callback(input);
          setInput("");
        }}
        style={{
          all: "unset",
          font: "inherit",
          color: "inherit",
          backgroundColor: "inherit",
          boxSizing: "border-box"
        }}
      />
    </div>
  );
}