import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { resolve } from "path";

import dbg from "debug";

import { Options } from "./config.js";

const debug = dbg.debug("gource-multi");

export type LineWriter = (line: string) => Promise<void> | void;

export function createOutputPipe(opts: Options): {
  writer: LineWriter;
  done: () => Promise<void>;
} {
  if (!opts.gource) {
    if (opts.output != null) {
      const file = createWriteStream(resolve(process.cwd(), opts.output));
      return {
        writer: (line) =>
          new Promise((resolve) => {
            file.write(line + "\n", () => resolve());
          }),
        done: () =>
          new Promise((resolve) => {
            file.close(() => resolve());
          }),
      };
    }

    return {
      writer: console.log,
      done: () => Promise.resolve(),
    };
  }

  const gourceArgs = ["--log-format", "custom", "--path", "-"];

  if (opts.gourceArguments != null) {
    gourceArgs.push(...opts.gourceArguments);
  }

  const pipe = opts.output != null;

  if (pipe) {
    gourceArgs.push("-o", "-");
  }

  debug("Arguments for gource", gourceArgs);

  const gource = spawn("gource", gourceArgs, {
    stdio: ["pipe", pipe ? "pipe" : "inherit", "inherit"],
  });

  if (opts.output) {
    const ffmpegArgs = [
      "-r",
      "60",
      "-f",
      "image2pipe",
      "-vcodec",
      "ppm",
      "-i",
      "-",
    ];

    if (opts.ffmpegArguments != null) {
      ffmpegArgs.push(...opts.ffmpegArguments);
    }

    ffmpegArgs.push("-y", opts.output);

    debug("Arguments for ffmpeg", ffmpegArgs);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["pipe", "inherit", "inherit"],
    });

    gource.stdout?.pipe(ffmpeg.stdin);
  }

  return {
    writer: (line: string) =>
      new Promise((resolve) => {
        gource.stdin?.write(line + "\n", () => resolve());
      }),
    done: () =>
      new Promise<void>((resolve) => {
        gource.stdin?.end();
        gource.on("close", resolve);
      }),
  };
}
