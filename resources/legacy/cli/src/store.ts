import { API_URL } from "./env.ts";
import { Database } from "@db/sqlite";
import { hashFile, spinner, getContentType } from "../lib/utils.ts";
import * as tables from "../lib/schema.ts";
import { setOptions } from "../lib/types.ts";

class Store {
  path: string;
  constructor() {
    this.path = "flair/store.db";
  }
  async setup() {
    const db = new Database(this.path);

    for (const [_, table] of Object.entries(tables)) {
      db.prepare(table).run();
    }

    await this.signIn();
    const repoHash = prompt("Please enter a repo-hash: ");
    await this.createBranch("central", repoHash || "");
    db.close();
  }

  async signIn() {
    if (!store.checkSignIn()) {
      console.log("Already signed in");
      return;
    }

    const url = "http://localhost:2000/";
    const start =
      Deno.build.os === "darwin"
        ? "open"
        : Deno.build.os === "windows"
        ? "cmd"
        : "xdg-open";
    const args = Deno.build.os === "windows" ? ["/c", "start", url] : [url];

    const ac = new AbortController();

    const serverHandled = new Promise<void>((resolve, reject) => {
      Deno.serve({ port: 2000, signal: ac.signal }, async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname;

        if (req.method === "GET" && pathname === "/") {
          const html = await Deno.readTextFile("lib/spa/index.html");
          return new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }

        if (pathname.startsWith("/assets/")) {
          const filePath = `lib/spa${pathname}`;
          try {
            const file = await Deno.readFile(filePath);
            const contentType = getContentType(pathname);
            return new Response(file, {
              status: 200,
              headers: { "Content-Type": contentType },
            });
          } catch (_) {
            return new Response("Asset not found", { status: 404 });
          }
        }

        if (req.method === "POST" && req.body) {
          const { authToken, wallet } = await req.json();
          if (!authToken || !wallet) {
            console.log("Could not sign in. Please try again.");
            reject();
            ac.abort();
            return new Response("Invalid sign-in", { status: 400 });
          }
          await store.walletSignIn(authToken, wallet);
          console.log("Successfully signed into Flair");
          resolve();
          ac.abort();
          return new Response("Success");
        }

        return new Response("404 - Not Found", { status: 404 });
      });
    });

    const a = new Deno.Command(start, { args });
    await a.output();

    await serverHandled;
  }

  getCreds() {
    const db = new Database(this.path);
    return db.sql`SELECT token, wallet, repo_hash from creds WHERE id = 1`[0];
  }

  getCurrentBranch() {
    const db = new Database(this.path);
    return db.sql`SELECT branch_id, branch_name from branches WHERE current = 1`[0];
  }

  async createBranch(name: string, hash: string = "") {
    const db = new Database(this.path);
    let repoHash = "";
    let token = "";

    const creds = this.getCreds();
    if (!creds) {
      console.error("No credentials found. Make sure you are signed in.");
      return;
    }

    token = creds.token;
    repoHash = hash || creds.repo_hash;
    try {
      const res = await fetch(
        `${API_URL}/repo/hash/${repoHash}/branch/create`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        }
      );
      const data = await res.json();
      const branchHash = data.data.branchHash;

      console.log("Created branch with hash:", branchHash);

      db.prepare(
        `UPDATE creds
           SET repo_hash = ?
           WHERE id = 1;
      `
      ).run(repoHash);

      db.prepare(
        `
      INSERT INTO branches (branch_name, branch_hash) VALUES (?);
    `
      ).run(name, branchHash);

      db.close();
    } catch (err) {
      console.error("Error:", err);
    }
  }

  getAllBranches() {
    const db = new Database(this.path);
    const branches = db.sql`SELECT branch_name from branches`;
    return branches.map((branch) => branch.branch_name);
  }

  hopBranch(branch: string) {
    const db = new Database(this.path);

    db.exec(`UPDATE branches
             SET current = 0
             WHERE current = 1;
          `);

    const a = db
      .prepare(
        `UPDATE branches
         SET current = 1
         WHERE branch_name = ?;
        `
      )
      .run(branch);

    if (!a) {
      console.log(
        `Branch ${branch} does not exist. Use "flair branch -l" to list all available branches.`
      );
      Deno.exit(0);
    }

    db.close();
  }

  getWeightSNO() {
    const db = new Database(this.path);
    const { weight_id } = db.sql`SELECT COUNT(*) as weight_id FROM weights`[0];
    return weight_id + 1;
  }

  async burnStore(
    description: string,
    burnHash: string,
    // metrics: string,
    combinedHash: string
  ) {
    const db = new Database(this.path);
    let parentBurnHash = "";

    const { branch_id } =
      db.sql`SELECT branch_id from branches WHERE current = 1`[0];

    if (combinedHash) {
      parentBurnHash = combinedHash;
    } else {
      const burnIdQuery =
        db.sql`SELECT burn_hash from burns ORDER BY burn_id DESC LIMIT 1`[0];
      parentBurnHash = burnIdQuery ? burnIdQuery.burn_hash : null;
    }

    const weightSNO = await this.getWeightSNO();
    const weightHash = await hashFile(burnHash);

    spinner.stop();
    spinner.start("Burning to timeline");

    db.prepare(
      `
      INSERT INTO weights (weights_hash, weights_file) VALUES (?, ?);
    `
    ).run(weightHash, `.flair/weights/${burnHash}.pth`);

    db.prepare(
      `
      INSERT INTO burns (burn_hash, description, parent_burn_hash, branch_id, weights_id) VALUES (?, ?, ?, ?, ?);
    `
    ).run(burnHash, description, parentBurnHash, branch_id, weightSNO);

    // db.prepare(
    //   `
    //   INSERT INTO metrics (burn_hash, architecture) VALUES (?, ?);
    // `
    // ).run(burnHash, metrics);
  }

  getLatestBurnHash(branch: string) {
    const db = new Database(this.path);

    const current = this.getCurrentBranch();
    if (branch == current.branch_name) {
      console.log("Cannot melt on the same branch");
      console.log("Current: " + branch);
      Deno.exit(0);
    }

    const meltBranch =
      db.sql`SELECT branch_id from branches WHERE branch_name = ${branch}`[0];
    if (!meltBranch) {
      console.log(
        `Branch ${branch} does not exist. Use "flair branch -l" to list all available branches.`
      );
      Deno.exit(0);
    }
    const meltBurnHash =
      db.sql`SELECT burn_hash from burns WHERE branch_id = ${meltBranch.branch_id} ORDER BY burn_id DESC LIMIT 1`[0];

    if (!meltBurnHash) {
      console.log(`There are no burns on branch ${branch}.`);
      Deno.exit(0);
    }

    const baseBurnHash =
      db.sql`SELECT burn_hash from burns WHERE branch_id = ${current.branch_id} ORDER BY burn_id DESC LIMIT 1`[0];

    if (!baseBurnHash) {
      console.log(`There are no burns on the current branch.`);
      console.log(`Current: ${current.branch_name}`);
      Deno.exit(0);
    }

    return [
      { baseBranch: current.branch_name, baseHash: baseBurnHash.burn_hash },
      { meltBranch: branch, meltHash: meltBurnHash.burn_hash },
    ];
  }

  getAllBurns() {
    const db = new Database(this.path);
    const { branch_id } = this.getCurrentBranch();
    return db.sql`SELECT burn_hash, description, author, branch_id, parent_burn_hash, created_at from burns WHERE branch_id = ${branch_id}`;
  }

  saveMisc(args: setOptions) {
    const db = new Database(this.path);

    const { is_present } = db.sql`SELECT COUNT(*) as is_present FROM misc`[0];

    if (is_present) {
      db.prepare(
        `
        UPDATE misc
        SET module_path = ?
        WHERE id = 1
        `
      ).run(args.path);

      db.prepare(
        `
        UPDATE misc
        SET model_instance = ?
        WHERE id = 1
        `
      ).run(args.model);
    } else {
      db.prepare(
        `
      INSERT INTO misc (module_path, model_instance) VALUES (?, ?);
        `
      ).run(args.path, args.model);
    }
  }
  getMisc() {
    const db = new Database(this.path);
    const misc = db.sql`SELECT module_path, model_instance FROM misc`[0];
    if (!misc) {
      console.log(
        "Values of --path and --model are not set. See 'flair burn --help' for more information."
      );
      Deno.exit(0);
    }
    return misc;
  }

  checkSignIn() {
    const db = new Database(this.path);
    const cred = db.sql`SELECT id FROM creds`[0];
    if (cred) return false;
    return true;
  }

  walletSignIn(token: string, wallet: string) {
    const db = new Database(this.path);
    db.prepare(
      `
      INSERT INTO creds (token, wallet) VALUES (?, ?);
        `
    ).run(token, wallet);
    db.close();
  }

  walletSignOut() {
    const db = new Database(this.path);
    db.prepare(
      `
      DELETE FROM creds WHERE id = 1;
      `
    ).run();
    console.log("Successfully signed out of Flair");
  }
}

const store = new Store();

export default store;
