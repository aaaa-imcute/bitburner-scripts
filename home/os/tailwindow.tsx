function assertDefined<T>(x: T): asserts x is NonNullable<T> {
  if (x == null) throw new Error("unexpected undefined");
}
export class WindowState {
  #data: ReactNode;
  forceUpdate: undefined | (() => void);
  element: ReactNode;
  ref: undefined | React.RefObject<HTMLDivElement>;
  error: undefined | Error | ((error: Error, info: React.ErrorInfo) => void);
  errorInfo: undefined | React.ErrorInfo;
  #classesFixed = false;
  get content() {
    return this.#data;
  }
  set content(v: ReactNode | ((prev: ReactNode) => ReactNode)) {
    if (typeof v == "function") {
      this.#data = v(this.#data);
    } else {
      this.#data = v;
    }
    this.forceUpdate?.();
  }
  fixClasses() {
    //copy classes from sibling node
    if (this.#classesFixed) throw new Error("Already fixed classes");
    this.#classesFixed = true;
    let curr = this.ref?.current;
    if (!curr?.parentElement?.children?.[1]) {
      throw new Error("Not in the corrent environment");
    }
    let other;
    for (let i of curr.parentElement.children) {
      if (i && i != curr) other = i;
    }
    if (!other) throw new Error("Somehow you've got this window element duplicated on the DOM tree??");
    curr.className = other.className;
  }
}
export class WindowFrameElement extends React.Component<{
  state: WindowState;
  style?: React.CSSProperties;
}> {
  #divRef = React.createRef<HTMLDivElement>();
  state = {
    tick: 0,
    parentElement: null as HTMLElement | null
  };
  #forceUpdateFn = () => {
    this.setState((s: { tick: number }) => ({ tick: s.tick + 1 }));
  };
  render() {
    this.props.state.forceUpdate = this.#forceUpdateFn;
    this.props.state.ref = this.#divRef;
    return this.props.state.element = (e => {
      if (this.props.state.ref.current) {
        //second render,move to correct place
        if (!this.state.parentElement) {
          this.state.parentElement = this.props.state.ref.current.parentElement?.parentElement ?? null;
        }
        if (!this.state.parentElement) {
          return e;//shouldn't happen,but i can't throw an error here i think
        }
        return ReactDOM.createPortal(e, this.state.parentElement);
      }
      return e;//first render,get ref
    })(
      <div ref={this.#divRef} style={this.props.style}>
        {this.props.state.content}
      </div>
    );
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    //the game provides us with an error catching wrapper,
    //but it interferes with the styles of our content,
    //so we should replace it.
    if (!this.props.state.error) {
      this.props.state.error = error;
      this.props.state.errorInfo = info;
    } else if (typeof this.props.state.error == "function") {
      this.props.state.error(error, info);
    } else {
      console.error("React component error not caught:");
      console.error(error, info);
      console.error("Previous error:");
      console.error(error, info);
    }
  }
}
interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export class TailWindow {
  titleState: WindowState;
  bodyState: WindowState;
  closeListener: undefined | EventListener;
  destroyed = false;
  logBox: HTMLElement;//the outermost element of the logbox,the one that says react-draggable
  parentElement: HTMLElement;
  isOpen = true;
  box: WindowRect = {
    //ui/React/LogBoxManager.tsx#L38
    x: innerWidth * 0.4,
    y: innerHeight * 0.3,
    w: 500,
    h: 500
  };
  onClose: undefined | (() => void);//only triggered on close button press, not close()
  onRerun: undefined | (() => void);//rerun button
  constructor(ns: NS) {
    this.titleState = new WindowState();
    this.bodyState = new WindowState();
    //ns.disableLog("ALL");
    ns.ui.setTailTitle(<WindowFrameElement state={this.titleState} style={{}} />);
    ns.printRaw(<WindowFrameElement state={this.bodyState} style={{
      position: "absolute",
      top: "36px",
      left: "1px",
      right: "1px",
      bottom: "0px",
      overflowY: "auto",
      backgroundColor: "black"
    }} />);
    ns.print("This message is sent to sample the classes of a normal print() log.");
    ns.ui.openTail();
    ns.ui.renderTail();
    this.titleState.forceUpdate?.();//render the second time to escape error catching wrapper
    this.bodyState.forceUpdate?.();
    this.bodyState.fixClasses();//it turns out this.bodyState is still missing some classes
    let el = this.bodyState.ref?.current?.parentElement?.parentElement?.parentElement?.parentElement;
    if (!el) throw new Error("Not in DOM");
    this.logBox = el;
    let parent = this.logBox.parentElement;
    if (!parent) throw new Error("Not in DOM");
    this.parentElement = parent;
    //get rid of the rerun and close buttons' functionality
    //and replace it with our own
    let hinderingButtons = this.logBox.children[0].children[0].children[1].children;
    hinderingButtons[0].addEventListener("click", e => {
      e.stopPropagation();
      this.goToTopLayer();
      this.onRerun?.();
    });
    hinderingButtons[1].addEventListener("click", e => {
      this.goToTopLayer();
    });
    hinderingButtons[2].addEventListener("click", this.closeListener = e => {
      e.stopPropagation();
      this.goToTopLayer();
      this.close();
      this.onClose?.();
    });
    //same for moving the tail window
    this.logBox.style.touchAction = "none";
    function draggable(el: HTMLElement, get: () => [number, number], set: (x: number, y: number) => void) {
      let grabbed: undefined | [number, number];
      let pointerId: undefined | number;
      let doc = el.ownerDocument;
      let move = (e: PointerEvent) => {
        e.stopPropagation();
        if (!grabbed || pointerId !== e.pointerId) return;
        set(grabbed[0] + e.clientX, grabbed[1] + e.clientY);
      };
      let up = (e: PointerEvent) => {
        e.stopPropagation();
        if (!grabbed || pointerId !== e.pointerId) return;
        grabbed = undefined;
        pointerId = undefined;
        doc.removeEventListener("pointermove", move);
        doc.removeEventListener("pointerup", up);
        doc.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointerdown", e => {
        //if (e.target != el) return;
        e.stopPropagation();
        if (e.pointerType == "mouse" && e.button != 0) return;
        pointerId = e.pointerId;
        let pos = get();
        grabbed = [pos[0] - e.clientX, pos[1] - e.clientY];
        doc.addEventListener("pointermove", move);
        doc.addEventListener("pointerup", up);
        doc.addEventListener("pointercancel", up);
        e.preventDefault();
      });
      let block = (e: UIEvent) => {
        if (e.target != el) return;
        e.stopPropagation();
      };
      //block react-draggable events
      el.addEventListener("mousedown", block);
      el.addEventListener("touchstart", block);
      el.addEventListener("mouseup", block);
      el.addEventListener("touchend", block);
    }
    let moveEl = this.logBox.children[0].children[0];
    if (!(moveEl instanceof HTMLElement)) throw new Error("Somehow not an element");
    draggable(/*this.logBox*/moveEl, () => [this.box.x, this.box.y], (x, y) => {
      this.move(x, y);
      this.goToTopLayer();
    });
    //...and resizing it
    let dragEl = this.logBox.children[0].children[2];
    if (!(dragEl instanceof HTMLElement)) throw new Error("Somehow not an element");
    draggable(
      dragEl,
      () => [this.box.x + this.box.w, this.box.y + this.box.h],
      (w, h) => {
        this.resize(w - this.box.x, h - this.box.y);
        this.goToTopLayer();
      }
    );
    this.goToTopLayer();//fix wonky z index
  }
  destroy() {
    if (this.destroyed) return;
    //reenable the close button and click it
    let closeButton = this.logBox.children[0].children[0].children[1].children[2];
    if (this.closeListener) {
      closeButton.removeEventListener("click", this.closeListener);
    }
    closeButton.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    }));
    this.destroyed = true;
  }
  assertAvailable() {
    if (this.destroyed) throw new Error("Window already destroyed");
  }
  open() {
    this.assertAvailable();
    if (this.isOpen) return () => { };
    this.parentElement.appendChild(this.logBox);
    this.isOpen = true;
    return () => this.close();
  }
  close() {
    this.assertAvailable();
    if (!this.isOpen) return () => { };
    this.parentElement.removeChild(this.logBox);
    this.isOpen = false;
    return () => this.open();
  }
  render() {
    this.assertAvailable();
    this.logBox.style.transform = `translate(${this.box.x}px, ${this.box.y}px)`;
    let resizable = this.logBox.children[0];
    if (!(resizable instanceof HTMLElement)) throw new Error("Somehow not an element");
    resizable.style.width = this.box.w + "px";
    resizable.style.height = this.box.h + "px";
    this.titleState.forceUpdate?.();
    this.bodyState.forceUpdate?.();
  }
  goToTopLayer() {
    let z = -Infinity;
    let list = this.logBox.parentElement?.children;
    if (!list) throw new Error("Not in DOM");
    for (let i of list) {
      if (i == this.logBox) continue;
      let o = getComputedStyle(i).zIndex;
      let value;
      if (o == "auto") value = 0;
      else value = +o;
      if (value > z) {
        z = value;
      }
    }
    this.logBox.style.zIndex = `${z + 1}`;
  }
  getPosition() {
    return [this.box.x, this.box.y];
  }
  getSize() {
    return [this.box.w, this.box.h];
  }
  move(x: number, y: number) {
    this.box.x = x;
    this.box.y = y;
    this.render();
  }
  resize(w: number, h: number) {
    //ui/React/LogBoxManager.tsx#L334
    this.box.w = Math.max(150, w);
    this.box.h = Math.max(33, h);
    this.render();
  }
  getDefaultStyle(title?: boolean) {
    this.assertAvailable();
    let close = this.open();
    let state = title ? this.titleState : this.bodyState;
    if (!state.ref?.current) throw new Error("Not in DOM");
    let ret = getComputedStyle(state.ref.current);
    close();
    return ret;
  }
  setFontSize(fontSize?: number | string) {
    this.assertAvailable();
    let size = typeof fontSize == "number" ? fontSize + "px" : fontSize;
    size = size ?? this.getDefaultStyle().fontSize;
    assertDefined(this.bodyState.ref?.current);
    this.bodyState.ref.current.style.fontSize = size;
  }
  setTitle(title: ReactNode | ((e: ReactNode) => ReactNode)) {
    this.assertAvailable();
    this.titleState.content = title;
  }
  setBody(body: ReactNode | ((e: ReactNode) => ReactNode)) {
    this.assertAvailable();
    this.bodyState.content = body;
  }
  isMinimized() {
    this.assertAvailable();
    let el = this.logBox.children[0].children[2];
    if (!(el instanceof HTMLElement)) throw new Error("Somehow not an element");
    return el.style.display == "none";
  }
  toggleMinimize() {
    this.assertAvailable();
    let close = this.open();
    let button = this.logBox.children[0].children[0].children[1].children[1];
    button.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    }));
    close();
  }
  setMinimized(minimized: boolean) {
    this.assertAvailable();
    //also returns how to restore the minimization
    let m = this.isMinimized();
    if (minimized != m) this.toggleMinimize();
    return () => this.setMinimized(m);
  }
}