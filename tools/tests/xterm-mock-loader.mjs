// Module loader that intercepts @xterm/* imports and returns mocks
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@xterm/xterm" || specifier === "@xterm/addon-fit" || specifier === "@xterm/addon-web-links" || specifier === "@xterm/addon-search") {
    const name = specifier.replace("@xterm/", "");
    const path = join(__dirname, `xterm-mock-${name}.mjs`);
    return { url: `file://${path}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
