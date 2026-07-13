#!/usr/bin/env node
import { runProjectTaskCli } from "./projectTaskClient.js";

process.exitCode = await runProjectTaskCli(process.argv.slice(2));
