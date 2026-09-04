import { copyFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const outputDirectory = new URL('../dist/', import.meta.url);
const projectRoot = new URL('../', import.meta.url);
const publicFiles = ['index.html', 'styles.css', 'app.js'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of publicFiles) {
  await copyFile(new URL(file, projectRoot), new URL(file, outputDirectory));
}

const amplifyOutputs = new URL('amplify_outputs.json', projectRoot);
let builtFileCount = publicFiles.length;
if (existsSync(amplifyOutputs)) {
  await copyFile(amplifyOutputs, new URL('amplify_outputs.json', outputDirectory));
  builtFileCount += 1;
}

console.log(`Built ${builtFileCount} frontend files in dist/.`);
