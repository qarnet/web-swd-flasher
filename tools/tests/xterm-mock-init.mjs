// Test loader that intercepts @xterm/* imports
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL("./tests/xterm-mock-loader.mjs", import.meta.url));
