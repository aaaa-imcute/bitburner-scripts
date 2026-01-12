function Tag() {
  const [v, sv] = React.useState(0);
  return (<>
    <input onChange={e=>sv(e.target.value)} />
    {v}
  </>);
}
/** @param {NS} ns */
export async function main(ns) {
  ns.printRaw(<Tag />);
}