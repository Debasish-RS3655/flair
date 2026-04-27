export const generateRandomHash = () => crypto.randomUUID().split("-").join("");

export const hashFile = async (hash: string) => {
  const fileData = await Deno.readFile(`flair/weights/${hash}.pth`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const sanitizePythonPath = (path: string) => {
  if (path.startsWith("./")) path = path.slice(2);
  else if (path.startsWith("/")) path = path.slice(1);
  if (path.endsWith(".py")) path = path.slice(0, path.length - 3);
  return path.replaceAll("/", ".").replaceAll("\\", ".");
};

const frames = ["●   ", " ●  ", "  ● ", "   ●", "  ● ", " ●  "];

class Spinner {
  interval: null | number;
  message: string;
  encoder: TextEncoder;
  constructor() {
    this.interval = null;
    this.message = "";
    this.encoder = new TextEncoder();
  }
  start(message: string) {
    this.message = message;
    let frameIndex = 0;

    this.interval = setInterval(() => {
      Deno.stdout.writeSync(
        this.encoder.encode(`\r${this.message} ${frames[frameIndex]}`)
      );
      frameIndex = (frameIndex + 1) % frames.length;
    }, 100);
  }
  stop() {
    clearInterval(this.interval as number);
    Deno.stdout.writeSync(this.encoder.encode("\r\x1b[2K"));
    Deno.stdout.writeSync(this.encoder.encode(`\r${this.message} ✔\n`));
  }
}

export const spinner = new Spinner();

export const bruteFlairSearch = async (level: number = 0) => {
  if (level > 12) {
    console.log("Directory nesting goes brr...");
    console.log("/flair not found");
    Deno.exit(0);
  }
  try {
    const fileInfo = await Deno.stat("flair");
    if (fileInfo.isDirectory) return;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      Deno.chdir("../");
      await bruteFlairSearch(level + 1);
    } else {
      console.error("Error:", error);
    }
  }
};

export const getContentType = (path: string) => {
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};
