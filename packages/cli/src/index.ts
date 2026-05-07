#!/usr/bin/env bun

import { createCLI } from "@bunli/core";
import applyCommand from "./commands/apply.command";
import approveCommand from "./commands/approve.command";
import initCommand from "./commands/init.command";
import planCommand from "./commands/plan.command";
import previewCommand from "./commands/preview.command";
import rejectCommand from "./commands/reject.command";
import reviewCommand from "./commands/review.command";

const cli = await createCLI({
	name: "railform",
	version: "0.0.1",
});

cli.command(applyCommand);
cli.command(approveCommand);
cli.command(initCommand);
cli.command(planCommand);
cli.command(previewCommand);
cli.command(rejectCommand);
cli.command(reviewCommand);

await cli.run();
