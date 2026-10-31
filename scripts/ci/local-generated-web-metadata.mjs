// Next writes this route-type reference during dev/build, including .next from
// Tauri's nested build. Preserve any other difference as a concurrent edit.
export function onlyGeneratedRouteReference(before, current, generatedRoots) {
  const expression = /^\/\/\/ <reference path="\.\/([^"\r\n]+)\/types\/routes\.d\.ts" \/>$/m;
  const previous = before.match(expression);
  const latest = current.match(expression);
  if (!previous || !latest) return current === before;
  if (latest[1] !== previous[1] && !generatedRoots.includes(latest[1])) return false;
  const normalized = current.replace(expression, previous[0]).replaceAll('\r\n', '\n');
  return normalized === before.replaceAll('\r\n', '\n');
}
