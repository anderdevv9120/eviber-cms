export function isDOMNode(x: unknown): x is Node {
  return typeof x === "object" && x !== null && "nodeType" in x && typeof x.nodeType === "number";
}
