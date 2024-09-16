import { readFile } from "fs/promises";

async function index() {
  const config = await readFile("./config.json");
  console.log(config.toString());
}

await index();
