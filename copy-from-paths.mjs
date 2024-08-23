import fs from 'node:fs';
import path from 'node:path';

const paths = JSON.parse(fs.readFileSync('paths.json'));

const imagesPath = './images';

if (!fs.existsSync(imagesPath)){
    fs.mkdirSync(imagesPath);
}

for (const id in paths) {
    fs.copyFileSync(paths[id], path.join(imagesPath, `${id}.png`));
}
