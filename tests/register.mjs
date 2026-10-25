// Installs the alias + stub resolution hooks for node:test runs.
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
