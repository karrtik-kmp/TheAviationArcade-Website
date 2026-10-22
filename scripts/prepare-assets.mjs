import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Run from the standalone website repository, before packaging the website.
// No download, generative transformation or cropping is performed here.
const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.env.WEBSITE_ASSET_SOURCE_ROOT || 'C:/Unity/Projects/AviationArcade_v2');
const projectRoot = path.join(sourceRoot, 'Assets', '_Project');
const mediaRoot = path.join(siteRoot, 'public', 'media');
const fontsRoot = path.join(siteRoot, 'public', 'fonts');
mkdirSync(mediaRoot, { recursive: true });
mkdirSync(fontsRoot, { recursive: true });

const fonts = [
  'Jost-SemiBold.ttf',
  'BarlowCondensed-Bold.ttf',
  'BarlowCondensed-SemiBold.ttf',
  'Poppins-Regular.ttf',
  'Poppins-Medium.ttf',
  'LICENSE-Jost-OFL.txt',
  'OFL-BarlowCondensed.txt',
  'OFL-Poppins.txt',
];
for (const font of fonts) {
  copyFileSync(path.join(projectRoot, 'UI', 'Fonts', font), path.join(fontsRoot, font));
}

const jobs = [
  ['hero', 'Identifier/ai-a1.jpg', 1920],
  ['aircraft', 'Identifier/ai-a1.jpg', 1280],
  ['tail', 'Identifier/ai-a2.jpg', 1280],
  ...[4, 5, 6, 7, 8].map((id) => [`potd-${id}`, `Potd/pod-${id}.jpg`, 1600]),
].map(([name, source, maxWidth]) => ({
  name,
  source: path.join(projectRoot, 'Content', 'ClientContent', 'Photos', source),
  output: path.join(mediaRoot, `${name}.jpg`),
  maxWidth,
}));

for (const job of jobs) {
  if (!existsSync(job.source)) throw new Error(`Missing original photo: ${job.source}`);
}

const python = process.env.WEBSITE_ASSET_PYTHON || 'python';
const resize = String.raw`
import json, sys
from pathlib import Path
from PIL import Image

for job in json.loads(sys.argv[1]):
    with Image.open(job['source']) as original:
        source = original.convert('RGB')
        for width, output in [
            (job['maxWidth'], job['output']),
            (640, str(Path(job['output']).with_name(job['name'] + '-640.jpg')))
        ]:
            image = source.copy()
            image.thumbnail((width, round(width * source.height / source.width)), Image.Resampling.LANCZOS)
            image.save(output, 'JPEG', quality=86, optimize=True, progressive=True)
`;
execFileSync(python, ['-c', resize, JSON.stringify(jobs)], { stdio: 'inherit' });

// Copy the existing mark unchanged. Typography remains live text in the website.
copyFileSync(path.join(projectRoot, 'Art', 'Branding', 'logo-164-17.png'), path.join(mediaRoot, 'logo.png'));
execFileSync(python, ['-c', String.raw`
import sys
from PIL import Image
with Image.open(sys.argv[1]) as image:
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    image.save(sys.argv[2], 'PNG', optimize=True)
`, path.join(mediaRoot, 'logo.png'), path.join(mediaRoot, 'logo-256.png')], { stdio: 'inherit' });

// This optional source is a generated illustration, never game-content evidence.
const communitySource = process.env.WEBSITE_COMMUNITY_SOURCE;
if (communitySource) {
  if (!existsSync(communitySource)) throw new Error(`Missing community illustration: ${communitySource}`);
  execFileSync(python, ['-c', String.raw`
import sys
from PIL import Image
with Image.open(sys.argv[1]) as image:
    if image.width * 600 != image.height * 1800:
        raise ValueError('Community illustration must have a 3:1 aspect ratio; this script does not crop.')
    image = image.convert('RGB').resize((1800, 600), Image.Resampling.LANCZOS)
    image.save(sys.argv[2], 'JPEG', quality=88, optimize=True, progressive=True)
`, communitySource, path.join(mediaRoot, 'community.jpg')], { stdio: 'inherit' });
  process.stdout.write('community.jpg: generated illustration resized to 1800x600.\n');
}

for (const job of jobs) {
  process.stdout.write(`${path.basename(job.output)}: ${Math.round(statSync(job.output).size / 1024)} KiB\n`);
}
process.stdout.write('Existing logo, five self-hosted fonts and bundled OFL notices prepared.\n');
