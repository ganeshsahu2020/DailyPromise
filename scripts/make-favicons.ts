// scripts/make-favicons.ts
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type Options = {
  src: string;
  out: string;
  sizes: readonly number[];
  basename: string; // without extension
};

const DEFAULTS: Options = {
  src: "public/brand/dailypromise-icon.svg",
  out: "public/brand",
  sizes: [32, 64, 128, 192, 256, 512] as const,
  basename: "dailypromise-icon",
};

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function generateFavicons(opts: Options): Promise<string[]> {
  const { src, out, sizes, basename } = opts;
  await ensureDir(out);

  const outputs: string[] = [];
  for (const s of sizes) {
    const file = path.join(out, `${basename}-${s}.png`);
    const buf = await sharp(src).resize(s, s).png().toBuffer();
    await fs.writeFile(file, buf);
    outputs.push(file);
  }
  return outputs;
}

async function main(): Promise<void> {
  // Optional CLI overrides:
  //   node --loader ts-node/esm scripts/make-favicons.ts public/brand/icon.svg public/brand my-icon
  const [srcArg, outArg, baseArg] = process.argv.slice(2);
  const opts: Options = {
    ...DEFAULTS,
    ...(srcArg ? { src: srcArg } : null),
    ...(outArg ? { out: outArg } : null),
    ...(baseArg ? { basename: baseArg } : null),
  };

  try {
    const files = await generateFavicons(opts);
    console.log("Favicons ready:");
    for (const f of files) console.log("  •", f);
  } catch (err) {
    console.error("Failed to generate favicons:", err);
    process.exit(1);
  }
}

void main();
