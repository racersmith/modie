#!/usr/bin/env bun
/**
 * Modie CLI executable entrypoint.
 */

import { runCli } from "./cli.ts";

const exitCode = await runCli(process.argv.slice(2));
process.exit(exitCode);
