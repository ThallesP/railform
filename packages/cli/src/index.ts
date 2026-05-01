#!/usr/bin/env bun

import { createCLI } from "@bunli/core";
import applyCommand from "./commands/apply.command";

const cli = await createCLI({
  name: "railform",
  version: "0.0.1",
});

cli.command(applyCommand);

await cli.run();
