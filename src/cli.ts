import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { basename, dirname, resolve } from "path";

import { program } from "@commander-js/extra-typings";
import chalk from "chalk";

import { configSchema, parseDateArgument } from "./config.js";
import { outputLogsAll } from "./logs.js";
import { createOutputPipe } from "./pipe.js";

program
  .argument(
    "[config-file]",
    "Configuration file containing repository list and options. (default: gource-multi.json in current directory)",
  )
  .option(
    "-s, --since <date>",
    "Only include logs after <date>",
    parseDateArgument,
  )
  .option(
    "-i, --consolidate-before <date>",
    "Consolidate all commits before <date> to a single 'Initial' commit.",
    parseDateArgument,
  )
  .option(
    "--fake-initial-commit",
    "Create a fake initial commit for each repository; " +
      "helpful if you are hiding root directory connections in Gource.",
  )
  .option(
    "--no-gource",
    "Do not launch the gource visualization; just output the logs.",
  )
  .option(
    "-o, --output <file>",
    "Save the output video (or logs if --no-gource specified) to the specified file.",
  )
  .option(
    "--show-stats",
    "Show a table of the commit counts for each repo, and the total.",
  )
  .action(async (configPath, options) => {
    configPath = checkConfigPath(configPath);

    const config = await readFile(configPath)
      .then((r) => r.toString())
      .then(JSON.parse)
      .then(configSchema.parseAsync);

    const repos = config.repos.map((repo) => ({
      ...repo,
      repoPath: resolve(dirname(configPath), repo.repoPath),
      label: repo.label ?? basename(repo.repoPath),
    }));

    const computedOptions = {
      ...config.options,
      ...options,
    };

    const pipe = createOutputPipe(computedOptions);
    await outputLogsAll(repos, computedOptions, pipe.writer);
    await pipe.done();
  })
  .parse();

process.on("uncaughtException", (err) => {
  if ("code" in err && err.code === "EPIPE") {
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

function checkConfigPath(configPath: string | undefined) {
  if (configPath == null) {
    configPath = resolve(process.cwd(), "gource-multi.json");
    if (!existsSync(configPath)) {
      console.warn(
        chalk.yellow(
          `No configuration file specified, and gource-multi.json not found in current directory.`,
        ),
      );
      process.exit(0);
    }
  } else {
    configPath = resolve(process.cwd(), configPath);
    if (!existsSync(configPath)) {
      console.error(chalk.red(`Configuration file ${configPath} not found.`));
      process.exit(1);
    }
  }

  return configPath;
}
