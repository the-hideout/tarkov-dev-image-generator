#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
const EventEmitter = require('events');
const got = require('got');

process.env.FONTCONFIG_PATH = __dirname;
//process.env.FC_DEBUG = 1;

const sharp = require('sharp');

const uploadImages = require('./upload-images');
const hashCalc = require('./hash-calculator');
const getJson = require('./get-json');

let bsgData = false;
let presets = false;
let bsgPresets = false;
const itemsByHash = {};
const itemsById = {};

const iconCacheFolder = process.env.LOCALAPPDATA+'\\Temp\\Battlestate Games\\EscapeFromTarkov\\Icon Cache\\live\\'
let iconData = {};

const colors = {
    violet: [
        '#271d2a',
        '#2c232f',
    ],
    grey: [
        '#191a1a',
        '#1e1e1e',
    ],
    yellow: [
        '#2f301d',
        '#343421',
    ],
    orange: [
        '#221611',
        '#261d14',
    ],
    green: [
        '#161c11',
        '#1a2314',
    ],
    red: [
        '#311c18',
        '#38221f',
    ],
    default: [
        '#363537',
        '#3a3c3b',
    ],
    black: [
        '#100f11',
        '#141614',
    ],
    blue: [
        '#1d262f',
        '#202d32',
    ],
};

const getChecks = async (width, height, itemColors) => {
    try {
        const pixels = [];
        let x = 0;
        let y = 0;
        while (pixels.length < width * height) {
            pixels.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${itemColors[(x + y) % 2]}"/>`);
            if (x < width -1) {
                x++;
            } else {
                x = 0;
                y++;
            }
        }
        const checks = Buffer.from(`
            <svg width="${width}" height="${height}">
                ${pixels.join('\n')}
            </svg>
        `);
        return sharp(checks).png();
    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }
};

const getItemText = (shortName, fontSize = 12) => {
    //${path.join(__dirname, 'fonts', 'bender.woff2')}
    //
    const svgBuffer = Buffer.from(`
        <svg>
            <style>
                @font-face {
                    font-family: MyBender;
                    src: url("/fonts/Bender.ttf"),
                        local("Bender");
                }
                .name-text {
                    font-size: ${fontSize}px;
                    font-family: Bender;
                    paint-order: stroke;
                    stroke: #000000;
                    stroke-width: 2px;
                    stroke-linecap: butt;
                    stroke-linejoin: miter;
                }
            </style>
            <text x="0" y="9" fill="white" class="name-text">${shortName}</text>
        </svg>
    `);
    return sharp(svgBuffer).png();
};

const getItemTextWidth = async (shortName, imageWidth) => {
    if (!shortName) {
        return sharp({
            create: {
                width: 1,
                height: 1,
                channels: 4,
                background: '#00000000'
            }
        });
    }
    // first try to fit the whole shortName, using font sizes 12-10
    for (let fontSize = 12; fontSize > 9; fontSize--) {
        const textImage = getItemText(shortName, fontSize);
        const textMeta = await textImage.metadata();
        if (textMeta.width <= imageWidth - 2) {
            return textImage;
        }
    }
    // if we couldn't fit the shortName, truncate the shortName at the
    // last space or slash, whichever is later and try at font sizes 12-11
    let clippedName = shortName;
    while (clippedName.includes('/') || clippedName.includes(' ')) {
        const lastSpace = clippedName.lastIndexOf(' ');
        const lastSlash = clippedName.lastIndexOf('/');
        let cutoff = lastSpace;
        if (lastSlash > lastSpace) cutoff = lastSlash;
        if (cutoff == -1) break;
        clippedName = clippedName.substring(0, cutoff);
        for (let fontSize = 12; fontSize > 10; fontSize--) {
            let textImage = getItemText(clippedName, fontSize);
            let textMeta = await textImage.metadata();
            if (textMeta.width <= imageWidth - 2) {
                return textImage;
            }
        }
    }
    // if we still couldn't fit the shortName, again truncate at the last space
    // or slash (if any) and then drop one letter until we can fit it
    clippedName = shortName;
    const firstSpace = clippedName.indexOf(' ');
    const firstSlash = clippedName.indexOf('/');
    let cutoff = firstSpace;
    if (firstSlash < firstSpace) cutoff = firstSlash;
    if (cutoff == -1) cutoff = clippedName.length;
    while (clippedName.length > 0) {
        clippedName = clippedName.substring(0, clippedName.length-1);
        for (let fontSize = 12; fontSize > 10; fontSize--) {
            let textImage = getItemText(clippedName, fontSize);
            let textMeta = await textImage.metadata();
            if (textMeta.width <= imageWidth - 2) {
                return textImage;
            }
        }
    }
    return Promise.reject(new Error(`Could not print shortName for ${shortName} at width ${imageWidth}`));
};

const getIcon = async (filename, item, options) => {
    if (!item) {
        console.log(`No item provided for ${filename}`);
        return Promise.reject(new Error(`No item provided for ${filename}`));
    }
    const itemColors = colors[item.backgroundColor];

    if(!itemColors){
        console.log(`No colors found for ${item.id} (${filename})`);
        return Promise.reject(new Error(`No colors found for ${item.id}`));
    }

    let shortName = false;
    if (presets[item.id]) {
        shortName = presets[item.id].name+'';
    } else {
        shortName = item.shortName+'';
    }
    if (!options.response.generated[item.id]) options.response.generated[item.id] = [];
    if (!options.response.uploaded[item.id]) options.response.uploaded[item.id] = [];
    if (!options.response.uploadErrors[item.id]) options.response.uploadErrors[item.id] = [];

    const baseImagePromise = new Promise(resolve => {
        if(item.needsBaseImage){
            console.log(`${item.id} should be uploaded for base-image`);
            fs.copyFileSync(path.join(iconCacheFolder, filename), path.join('./', 'generated-images-missing', `${item.id}-base-image.png`));
            options.response.generated[item.id].push('base');
        }
        resolve(true);
    });

    // create icon
    const iconPromise = new Promise(async (resolve, reject) => {
        if (options.generateOnlyMissing && !item.needsIconImage) {
            resolve(true);
            return;
        }
        try {
            const promises = [];
            const image = await sharp(path.join(iconCacheFolder, filename)).resize({width: 64, height: 64}).toBuffer();
            let icon = await getChecks(64, 64, itemColors).then(async background => {
                const buffer = await background.composite([{
                    input: image,
                    blend: 'over'
                }]).toBuffer();
                return sharp(buffer).extract({left: 1, top: 1, width: 62, height: 62});
            });

            promises.push(icon.jpeg({quality: 100}).toFile(path.join('./', 'generated-images', `${item.id}-icon.jpg`)));

            if (item.needsIconImage) {
                console.log(`${item.id} should be uploaded for icon`);
                promises.push(icon.jpeg({quality: 100}).toFile(path.join('./', 'generated-images-missing', `${item.id}-icon.jpg`)));
            }

            await Promise.all(promises);
            options.response.generated[item.id].push('icon');
            resolve(true);
        } catch (error) {
            console.log('icon error', error.constructor.name, error);
            reject(error);
        }
    });
console.log(process.env)
    // create grid image
    const gridImagePromise = new Promise(async resolve => {
        if (options.generateOnlyMissing && !item.needsGridImage) {
            resolve(true);
            return;
        }
        const promises = [];
        const sourceImage = sharp(path.join(iconCacheFolder, filename));
        const sourceMetadata = await sourceImage.metadata();
        const background = await getChecks(sourceMetadata.width, sourceMetadata.height, itemColors);
        const imageBuffer = await sourceImage.toBuffer();
        background.composite([{
            input: imageBuffer,
            blend: 'over'
        }]);
        if (shortName) {
            try {
                shortName = shortName.trim().replace(/\r/g, '').replace(/\n/g, '');
            } catch (error) {
                console.log(`Error trimming shortName ${shortName} for ${JSON.stringify(item.id)}`);
                shortName = false;
            }
        } else {
            console.log(`No shortName for ${JSON.stringify(item.id)}`);
        }
        const textImage = await getItemTextWidth(shortName, sourceMetadata.width);
        const textMeta = await textImage.metadata();
        const gridImage = sharp(await background.toBuffer()).composite([{
            input: await textImage.toBuffer(),
            blend: 'over',
            top: 2,
            left: sourceMetadata.width - textMeta.width - 2
        }]);
        
        promises.push(gridImage.jpeg({quality: 100}).toFile(path.join('./', 'generated-images', `${item.id}-grid-image.jpg`)));

        if (item.needsGridImage) {
            console.log(`${item.id} should be uploaded for grid-image`);
            promises.push(gridImage.jpeg({quality: 100}).toFile(path.join('./', 'generated-images-missing', `${item.id}-grid-image.jpg`)));
        }
        await Promise.all(promises);
        options.response.generated[item.id].push('grid image');
        resolve(true);
    }).catch(error => {
        console.log('grid image error', error);
        return Promise.reject(error);
    });
    try {
        await Promise.all([baseImagePromise, iconPromise, gridImagePromise]);
    } catch (error) {
        //console.log('all images error', error.message, error.stack);
        throw(error);
    }
    return true;
}

const cacheListener = new EventEmitter();
const refreshCache = () => {
    iconData = JSON.parse(fs.readFileSync(iconCacheFolder+'index.json', 'utf8'));
    cacheListener.emit('refresh');
};

const cacheChanged = (timeoutMs) => {
    return new Promise((resolve, reject) => {
        let timeoutId = false;
        cacheListener.once('refresh', () => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(new Date());
        });
        if (timeoutMs) {
            timeoutId = setTimeout(() => {
                reject(new Error(`Cache did not update in ${timeoutMs}ms`));
            }, timeoutMs);
        }
    });
};

const cacheIsLoaded = () => {
    for (let key in iconData) {
        if (iconData.hasOwnProperty(key)) {
            return true;
        }
    }
    return false;
};

const loadBsgData = async () => {
    bsgData = await getJson.items();
};

const loadPresets = async () => {
    presets = await getJson.td_presets();
};

const loadBsgPresets = async () => {
    bsgPresets = await getJson.presets();
};

const setBackgroundColor = (item) => {
    item.backgroundColor = 'default';
    if (bsgData && bsgData[item.id]) {
        if (bsgData[item.id]._props) {
            if (colors[bsgData[item.id]._props.BackgroundColor]) {
                item.backgroundColor = bsgData[item.id]._props.BackgroundColor;
            }
        }
    }
};

const hashItems = async (options) => {
    defaultOptions = {
        targetItemId: false,
        foundBaseImages: false
    };
    if (!options) options = {};
    options = {
        ...defaultOptions,
        ...options
    }
    let foundBaseImages = options.foundBaseImages;
    if (!foundBaseImages) {
        try {
            foundBaseImages = JSON.parse((await got('https:///manager.tarkov.dev/data/existing-bases.json')).body);
        } catch (error) {
            console.log(`Error downloading found base image list: ${error}`);
        }
    }
    try {
        let queryArgs = '';
        //let queryParams = 'type: any';
        if (options.targetItemId) {
            queryArgs = `(ids: ["${options.targetItemId}"])`;
        }
        const response = await got.post('https://api.tarkov.dev/graphql', {
            body: JSON.stringify({query: `{
                items${queryArgs} {
                  id
                  shortName
                  iconLink
                  gridImageLink
                  backgroundColor
                  types
                  properties {
                    ...on ItemPropertiesPreset {
                        baseItem {
                            id
                        }
                    }
                    ...on ItemPropertiesWeapon {
                        slots {
                            name
                        }
                    }
                  }
                }
              }`
            }),
            responseType: 'json',
            resolveBodyOnly: true
        });
        hashCalc.init(bsgData, bsgPresets, presets);
        let missingGridImage = 0;
        let missingIcon = 0;
        let missingBaseImage = 0;
        //response.data.items.forEach((itemData) => {
        for (let i = 0; i < response.data.items.length; i++) {
            const itemData = response.data.items[i];
            if (itemData.types.includes('disabled')) continue;
            itemData.needsGridImage = false;
            itemData.needsIconImage = false;
            itemData.needsBaseImage = false;
            if (itemData.gridImageLink.includes('unknown-item')) {
                itemData.needsGridImage = true;
                missingGridImage++;
            }

            if (itemData.iconLink.includes('unknown-item')) {
                itemData.needsIconImage = true;
                missingIcon++;
            }
            if (foundBaseImages && !foundBaseImages.includes(itemData.id)) {
                itemData.needsBaseImage = true;
                missingBaseImage++;
            }
            //setBackgroundColor(itemData);

            try {
                const hash = hashCalc.getItemHash(itemData.id);
                itemData.hash = hash;
                itemsByHash[hash.toString()] = itemData;
            } catch (error) {
                console.log(`Error hashing ${itemData.id}: ${error}`);
            }
            itemsById[itemData.id] = itemData;
            if (itemData.id == options.targetItemId && itemData.hash) {
                console.log(itemData.hash);
                break;
            }
        };
        console.log(`Found ${missingGridImage} items missing a grid image, ${missingIcon} missing an icon, and ${missingBaseImage} missing a base image`);
    } catch (error) {
        return Promise.reject(error);
    }
};

const initialize = async (options) => {
    const defaultOptions = {
        skipHashing: false
    };
    if (typeof options !== 'object') options = {};
    const opts = {
        ...defaultOptions,
        ...options
    }
    if (options.API_USERNAME) process.env.API_USERNAME = options.API_USERNAME;
    if (options.API_PASSWORD) process.env.API_PASSWORD = options.API_PASSWORD;
    if (options.SCANNER_NAME) process.env.SCANNER_NAME = options.SCANNER_NAME;
    await loadBsgData();
    await loadPresets();
    await loadBsgPresets();
    if (!options.skipHashing) {
        await hashItems(opts);
    }
};

const generate = async (options, forceImageIndex) => {
    const defaultOptions = {
        targetItemId: false, 
        forceImageIndex: false, 
        generateOnlyMissing: false, 
        cacheUpdateTimeout: false,
        upload: true
    };
    if (!options) options = defaultOptions;
    if (typeof options === 'string') {
        options = {
            targetItemId: options
        };
    }
    if (forceImageIndex) {
        options.forceImageIndex = forceImageIndex;
        if (!options.targetItemId) {
            return Promise.reject(new Error('You must specify the target item id to use forceImageIndex'));
        }
    }
    options = {
        ...defaultOptions,
        ...options,
        response: {
            generated: {},
            uploaded: {},
            uploadErrors: {}
        }
    };
    if (!bsgData) {
        await loadBsgData();
    }
    if (!presets) {
        await loadPresets();
    }
    if (!bsgPresets) {
        await loadBsgPresets();
    }
    if (!cacheIsLoaded()) {
        refreshCache();
    }
    try {
        const imgDir = path.join('./', 'generated-images');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

        const missingImgDir = path.join('./', 'generated-images-missing');
        if (!fs.existsSync(missingImgDir)) {
            fs.mkdirSync(missingImgDir);
        } else {
            console.log('Removing old missing images...');
            const oldMissingFiles = fs.readdirSync(missingImgDir);
            for (let i = 0; i < oldMissingFiles.length; i++) {
                fs.unlink(path.join(missingImgDir, oldMissingFiles[i]), (err) => {
                    if (err) {
                        throw err;
                    }
                });
            }
        }

    } catch (mkdirError){
        // Do nothing
        console.log(mkdirError);
        return Promise.reject(mkdirError);
    }

    if (options.targetItemId || options.item) {
        let item = false;
        if (options.targetItemId) {
            if (!itemsById[options.targetItemId]) {
                await hashItems(options);
            }
            item = itemsById[options.targetItemId];
        } else {
            item = options.item;
            options.targetItemId = item.id;
            if (!item.backgroundColor) {
                setBackgroundColor(item);
            }
            try {
                hashCalc.init(bsgData, bsgPresets, presets);
                item.hash = hashCalc.getItemHash(item.id);
                if (!itemsByHash[item.hash.toString()]) {
                    itemsByHash[item.hash.toString()] = item;
                }
            } catch (error) {
                console.log(`Error hashing ${item.id}: ${error}`);
            }
        }
        if (!item) return Promise.reject(new Error(`Item ${options.targetItemId} is unknown`));
        let fileName = `${options.forceImageIndex}.png`;
        if (!options.forceImageIndex) {
            const hash = item.hash;
            if (!hash) return Promise.reject(new Error(`Item ${options.targetItemId} has no hash`));
            if (!iconData[hash]) {
                try {
                    if (options.cacheUpdateTimeout === false || (Array.isArray(item.types) && item.types.includes('gun'))) {
                        throw new Error('not found');
                    }
                    await cacheChanged(options.cacheUpdateTimeout);
                    if (!iconData[hash]) {
                        throw new Error('not found');
                    }
                } catch (error) {
                    return Promise.reject(new Error(`Item ${options.targetItemId} hash ${hash} not found in cache`));
                }
            }
            fileName = `${iconData[hash]}.png`;
        } 
        try {
            await getIcon(fileName, item, options);
        } catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    } else {
        await hashItems(options);
        const hashes = Object.keys(iconData);
        for (let i = 0; i < hashes.length; i++) {
            const hash = hashes[i];
            try {
                console.log(`Processing ${i + 1}/${hashes.length}`);
                if (!itemsByHash[hash]) {
                    continue;
                }
                if (itemsByHash[hash].types.includes('gun') || itemsByHash[hash].types.includes('preset')) {
                    continue;
                }
                await getIcon(`${iconData[hash]}.png`, itemsByHash[hash], options);
            } catch (error) {
                console.log(error);
            }
        }
    }

    if (options.upload) {
        await uploadImages(options);
    }
    return options.response;
};

let watcher = false;
const watchIconCacheFolder = () => {
    if (watcher) watcher.close();
    watcher = fs.watch(iconCacheFolder, {persistent: false}, (eventType, filename) => {
        if (filename === 'index.json') {
            try {
                refreshCache();
            } catch (error) {
                console.log('Icon cache is missing');
            }
        }
    });
    watcher.on('error', () => {
        watcher.close();
        watcher = false;
        watchIconCacheFolderReady();
    });
};

let readyWatcher = false;
const watchIconCacheFolderReady = () => {
    if (readyWatcher) readyWatcher.close();
    const bsgTemp = process.env.LOCALAPPDATA+'\\Temp\\Battlestate Games';
    readyWatcher = fs.watch(bsgTemp, {persistent: false, recursive: true}, (eventType, filename) => {
        console.log(`${eventType} ${filename}`);
        if (filename === 'EscapeFromTarkov\\Icon Cache\\live\\index.json') {
            watchIconCacheFolder();
            readyWatcher.close();
            readyWatcher = false;
        }
    });
};

const startWatcher = () => {
    try {
        refreshCache();
    } catch (error) {
        console.log('Icon cache is missing');
    }
    try {
        watchIconCacheFolder();
    } catch (error) {
        watchIconCacheFolderReady();
    }
};

module.exports = {
    initializeImageGenerator: initialize,
    generateImages: generate,
    startWatchingCache: startWatcher,
    stopWatchingCache: () => {
        if (watcher) {
            watcher.close();
            watcher = false;
        }
        if (readyWatcher) {
            readyWatcher.close();
            readyWatcher = false;
        }
    }
};
