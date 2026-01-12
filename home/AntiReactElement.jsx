export function AntiReactElement({ state }) {
  //i hate react
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  state.forceUpdate = forceUpdate;
  return state.element = <div>{state.content}</div>;
}