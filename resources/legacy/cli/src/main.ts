#!/usr/bin/env -S deno run --allow-run

import { Command } from "@cliffy/command";
import store from "./store.ts";
import { burnOptions, meltOptions } from "../lib/types.ts";
import flair from "./function.ts";
import {
  bruteFlairSearch,
  sanitizePythonPath,
  getContentType,
} from "../lib/utils.ts";
import { API_URL } from "./env.ts";

const program = new Command();
const abort = async () => {
  console.log("\nProcess aborted");
  // await Deno.remove("burn.py");
  // await Deno.remove("metrics.py");
  Deno.exit(0);
};

program
  .name("flair")
  .description("Version control for Flair")
  .option("-v, --version", "", {
    standalone: true,
    action: () => {
      console.log(flair.version);
    },
  })
  .action(() => console.log("Version control for Flair"))
  .command("up")
  .action(() => flair.initialize())
  .command("branch", "Displays current working branch")
  .option("-l, --list", "List all available branches", {
    standalone: true,
    action: async () => {
      await bruteFlairSearch();
      const branches = store.getAllBranches();
      for (const branch of branches) {
        const { branch_name } = store.getCurrentBranch();
        if (branch_name == branch) {
          console.log(branch + " <--");
        } else console.log(branch);
      }
    },
  })
  .action(async () => {
    await bruteFlairSearch();
    const { branch_name } = store.getCurrentBranch();
    console.log(`Current: ${branch_name}`);
  })
  .command("create", "Creates a new branch")
  .arguments("<name>")
  .action(async (_: void, branch: string) => {
    await bruteFlairSearch();
    store.createBranch(branch);
    console.log("New branch created");
    const { branch_name } = store.getCurrentBranch();
    console.log(`Current: ${branch_name}`);
  })
  .command("hop", "Switches to another branch")
  .arguments("<name>")
  .action(async (_: void, branch: string) => {
    await bruteFlairSearch();
    store.hopBranch(branch);
    const { branch_name } = store.getCurrentBranch();
    console.log(`Current: ${branch_name}`);
  })
  .command("burn", "")
  .option(
    "-p, --path [type:string]",
    "Absolute path to module containing model with respect to .flair"
  )
  .option("-m, --model [type:string]", "Name of model instance")
  .option(
    "-a, --data-path [type:string]",
    "Absolute path to dataset with respect to .flair"
  )
  .option("-i, --data-instance [type:string]", "Name of dataset instance")
  .option("-s, --set", "", {
    default: true,
    conflicts: ["description"],
    action: async (args) => {
      await bruteFlairSearch();
      args.path = sanitizePythonPath(args.path as string);
      store.saveMisc(args);
      Deno.exit(0);
    },
  })
  .option("-d, --description [type:string]", "Description", {
    required: true,
  })
  .group("The required flags to pass while burning")
  .action(async (options: burnOptions, _: void) => {
    await bruteFlairSearch();
    flair.burnWeights(options);
  })
  .command("timeline", "Displays history of burns on current branch")
  .action(async () => {
    await bruteFlairSearch();
    const burns = store.getAllBurns().reverse();
    console.log(
      `\nBurn timeline on branch: ${store.getCurrentBranch().branch_name}\n`
    );
    for (let i = 0; i < burns.length; i++) {
      let parentHash = [];
      const a = burns[i].description.split(" ");
      const base = a[1];
      const melt = a[3];

      if (burns[i].parent_burn_hash && burns[i].parent_burn_hash.length > 32) {
        parentHash = burns[i].parent_burn_hash.split(";");
      }
      console.log(
        `${burns[i].burn_hash} -- ${burns[i].author} -- ${burns[i].created_at}`
      );
      console.log(`  ${burns[i].description}`);
      if (parentHash.length)
        console.log(
          `\n\t${parentHash[0]}: ${base}` + `\n\t${parentHash[1]}: ${melt}`
        );
      console.log(`${i < burns.length - 1 ? "\n^\n|\n" : ""}`);
    }
  })
  .command("wipe", "Wipes all traces of flair")
  .action(async () => {
    await bruteFlairSearch();
    await Deno.remove(".flair", { recursive: true });
  })
  .command("melt")
  .option("-b, --branch [type:string]", "Branch to melt on", {
    required: true,
  })
  .action(async (options: meltOptions, _: void) => {
    await bruteFlairSearch();
    // flair.melt(options);
  })
  .command("signin")
  .action(async () => {
    await bruteFlairSearch();
    await store.signIn();
  })
  .command("out")
  .action(async () => {
    await bruteFlairSearch();
    store.walletSignOut();
  })
  .command("create-collection")
  .action(async () => {
    try {
      const { token, repo_hash } = store.getCreds();
      const res = await fetch(
        `${API_URL}/repo/hash/${repo_hash}/create_collection`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      console.log("Created repo collection with address:", data.data);
    } catch (err) {
      console.error("Error:", err);
    }
  })
  .command("create-nft")
  .arguments("<commit-hash>")
  .action(async (_: void, commitHash: string) => {
    try {
      const { branch_hash } = store.getCurrentBranch();
      const { token, repo_hash } = store.getCreds();
      const res = await fetch(
        `${API_URL}/repo/hash/${repo_hash}/branch/hash/${branch_hash}/commit/hash/${commitHash}/createNft`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      console.log(data);
      // console.log('Created commit NFT with address:', data.data);
      console.log("Commit NFT created on Solana.");
    } catch (err) {
      console.error("Error:", err);
    }
  })
  // .command("rollback")
  // .action(() => {})
  // .command("fetch")
  // .action(() => {})
  .parse(Deno.args);

// Deno.addSignalListener("SIGTERM", abort); // unavailable on windows
Deno.addSignalListener("SIGINT", abort);