import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

const outputDirectory = new URL('../dist/', import.meta.url);
const projectRoot = new URL('../', import.meta.url);
const publicFiles = ['index.html', 'styles.css', 'app.js', 'theme.js'];

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

await build({
  entryPoints:[new URL('../auth.js', import.meta.url).pathname],
  outfile:new URL('auth.js', outputDirectory).pathname,
  bundle:true,
  format:'esm',
  platform:'browser',
  target:['es2022'],
  minify:true,
  sourcemap:false,
});
// Public OAuth client ID only. Secrets must never enter frontend build output.
const authConfig = JSON.parse(await readFile(new URL('auth-config.json', projectRoot), 'utf8'));
await writeFile(new URL('auth-config.json', outputDirectory), JSON.stringify({googleClientId:process.env.GOOGLE_CLIENT_ID || authConfig.googleClientId}));
console.log(`Built ${builtFileCount + 2} frontend files in dist/.`);
