#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
const EventEmitter = require('events');
const got = require('got');

const Jimp = require('jimp');

const uploadImages = require('./upload-images');
const hashCalc = require('./hash-calculator');
const getJson = require('./get-json');

let bsgData = false;
let presets = false;
let sptPresets = false;
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

    const sourceImage = await Jimp.read(path.join(iconCacheFolder, filename));

    const baseImagePromise = new Promise(resolve => {
        if(item.needs_base_image){
            console.log(`${item.id} should be uploaded for base-image`);
            fs.copyFileSync(path.join(iconCacheFolder, filename), path.join('./', 'generated-images-missing', `${item.id}-base-image.png`));
            options.response.generated[item.id].push('base');
        }
        resolve(true);
    });

    // create icon
    const iconPromise = new Promise(async resolve => {
        if (options.generateOnlyMissing && !item.needs_icon_image) {
            resolve(true);
            return;
        }
        const promises = [];
        const checks = new Jimp(62, 62);
        checks.scan(0, 0, checks.bitmap.width, checks.bitmap.height, function(x, y) {
            checks.setPixelColor(Jimp.cssColorToHex(itemColors[(x + y) % 2]), x, y);
        });

        const image = await Jimp.read(path.join(iconCacheFolder, filename));
        image
            .scaleToFit(64, 64)
            .contain(64, 64)
            .crop(1, 1, 62, 62)
            .composite(checks, 0, 0, {
                mode: Jimp.BLEND_DESTINATION_OVER,
            });

        promises.push(image.writeAsync(path.join('./', 'generated-images', `${item.id}-icon.jpg`)));

        if (item.needs_icon_image) {
            console.log(`${item.id} should be uploaded for icon`);
            promises.push(image.writeAsync(path.join('./', 'generated-images-missing', `${item.id}-icon.jpg`)));
        }
        await Promise.all(promises);
        options.response.generated[item.id].push('icon');
        resolve(true);
    });

    // create grid image
    const gridImagePromise = new Promise(async resolve => {
        if (options.generateOnlyMissing && !item.needs_grid_image) {
            resolve(true);
            return;
        }
        const promises = [];
        const checks = new Jimp(sourceImage.bitmap.width, sourceImage.bitmap.height);
        checks.scan(0, 0, checks.bitmap.width, checks.bitmap.height, function(x, y) {
            checks.setPixelColor(Jimp.cssColorToHex(itemColors[(x + y) % 2]), x, y);
        });

        const image = await Jimp.read(path.join(iconCacheFolder, filename));
        image
            .composite(checks, 0, 0, {
                mode: Jimp.BLEND_DESTINATION_OVER,
            });

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
        if (shortName) {
            let namePrinted = false;
            let fontSize = 12;
            let textWidth = sourceImage.bitmap.width;
            while (!namePrinted && fontSize > 9) {
                await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-${fontSize}.fnt`)).then(font => {
                    try {
                        textWidth = Jimp.measureText(font, shortName);
                        if (textWidth < sourceImage.bitmap.width) {
                            image.print(font, sourceImage.bitmap.width-textWidth-2, 2, {
                                text: shortName,
                                alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                            });
                            namePrinted = true;
                        }
                    } catch (error) {
                        console.log(`Error adding text to ${shortName} ${item.id}`);
                        console.log(error);
                    }
                });
                fontSize--;
            }
            let clippedName = shortName;
            if (!namePrinted) {
                while (!namePrinted && (clippedName.includes('/') || clippedName.includes(' '))) {
                    const lastSpace = clippedName.lastIndexOf(' ');
                    const lastSlash = clippedName.lastIndexOf('/');
                    let cutoff = lastSpace;
                    if (lastSlash > lastSpace) cutoff = lastSlash;
                    if (cutoff == -1) break;
                    clippedName = clippedName.substring(0, cutoff);
                    await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-12.fnt`)).then(font => {
                        try {
                            textWidth = Jimp.measureText(font, clippedName);
                            if (textWidth < sourceImage.bitmap.width) {
                                image.print(font, sourceImage.bitmap.width-textWidth-2, 2, {
                                    text: clippedName,
                                    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                                    alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                                });
                                namePrinted = true;
                            }
                        } catch (error) {
                            console.log(`Error adding text to ${shortName} ${item.id}`);
                            console.log(error);
                        }
                    });
                    if (namePrinted) break;
                    await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-11.fnt`)).then(font => {
                        try {
                            textWidth = Jimp.measureText(font, clippedName);
                            if (textWidth < sourceImage.bitmap.width) {
                                image.print(font, sourceImage.bitmap.width-textWidth-2, 2, {
                                    text: clippedName,
                                    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                                    alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                                });
                                namePrinted = true;
                            }
                        } catch (error) {
                            console.log(`Error adding text to ${shortName} ${item.id}`);
                            console.log(error);
                        }
                    });
                }
            }
            if (!namePrinted) {
                clippedName = shortName;
                const firstSpace = clippedName.indexOf(' ');
                const firstSlash = clippedName.indexOf('/');
                let cutoff = firstSpace;
                if (firstSlash < firstSpace) cutoff = firstSlash;
                if (cutoff == -1) cutoff = clippedName.length;
                while (!namePrinted) {
                    clippedName = clippedName.substring(0, clippedName.length-1);
                    await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-12.fnt`)).then(font => {
                        try {
                            textWidth = Jimp.measureText(font, clippedName);
                            if (textWidth < sourceImage.bitmap.width) {
                                image.print(font, sourceImage.bitmap.width-textWidth-2, 2, {
                                    text: clippedName,
                                    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                                    alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                                });
                                namePrinted = true;
                            }
                        } catch (error) {
                            console.log(`Error adding text to ${shortName} ${item.id}`);
                            console.log(error);
                        }
                    });
                    if (namePrinted) break;
                    await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-11.fnt`)).then(font => {
                        try {
                            textWidth = Jimp.measureText(font, clippedName);
                            if (textWidth < sourceImage.bitmap.width) {
                                image.print(font, sourceImage.bitmap.width-textWidth-2, 2, {
                                    text: clippedName,
                                    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                                    alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
                                });
                                namePrinted = true;
                            }
                        } catch (error) {
                            console.log(`Error adding text to ${shortName} ${item.id}`);
                            console.log(error);
                        }
                    });
                }
            }
            if (!namePrinted) {
                fs.writeFile(path.join('./', 'logging', `${shortName.replace(/[^a-zA-Z0-9]/g, '')}-${item.id}-not-printed.json`), JSON.stringify({shortName: shortName, id: item.id}, null, 4), 'utf8', (err) => {
                    if (err) {
                        console.log(`Error writing no prices found file: ${err}`);
                    }
                });
            }
        }

        promises.push(image.writeAsync(path.join('./', 'generated-images', `${item.id}-grid-image.jpg`)));

        if (item.needs_grid_image) {
            console.log(`${item.id} should be uploaded for grid-image`);
            promises.push(image.writeAsync(path.join('./', 'generated-images-missing', `${item.id}-grid-image.jpg`)));
        }
        await Promise.all(promises);
        options.response.generated[item.id].push('grid image');
        resolve(true);
    });
    await Promise.all([baseImagePromise, iconPromise, gridImagePromise]);
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
    presets = await getJson.tt_presets();
};

const loadSptPresets = async () => {
    sptPresets = await getJson.presets();
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
        let queryType = `itemsByType(type: any)`;
        //let queryParams = 'type: any';
        if (options.targetItemId) {
            queryType = `item( id: "${options.targetItemId}")`;
        }
        const response = await got.post('https://api.tarkov.dev/graphql', {
            body: JSON.stringify({query: `{
                ${queryType}{
                  id
                  shortName
                  iconLink
                  gridImageLink
                  types
                }
              }`
            }),
            responseType: 'json',
        });
        if (options.targetItemId) {
            response.body.data.itemsByType = [response.body.data.item];
        }
        hashCalc.init(bsgData, sptPresets, presets);
        let missingGridImage = 0;
        let missingIcon = 0;
        let missingBaseImage = 0;
        let finished = false;
        response.body.data.itemsByType.map((itemData) => {
            if (finished || itemData.types.includes('disabled')) return;
            itemData.needs_grid_image = false;
            itemData.needs_icon_image = false;
            itemData.needs_base_image = false;
            if(!itemData.gridImageLink){
                itemData.needs_grid_image = true;
                missingGridImage++;
            }

            if(!itemData.iconLink){
                itemData.needs_icon_image = true;
                missingIcon++;
            }
            if (foundBaseImages && !foundBaseImages.includes(itemData.id)) {
                itemData.needs_base_image = true;
                missingBaseImage++;
            }
            setBackgroundColor(itemData);

            try {
                const hash = hashCalc.getItemHash(itemData.id);
                itemData.hash = hash;
                itemsByHash[hash.toString()] = itemData;
            } catch (error) {
                console.log(`Error hashing ${itemData.id}: ${error}`);
            }
            itemsById[itemData.id] = itemData;
            if (itemData.id == options.targetItemId) {
                console.log(itemData.hash);
                finished = true;
            }
        });
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
    await loadSptPresets();
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
        ...options
    };
    options.response = {
        generated: {},
        uploaded: {},
        uploadErrors: {}
    }
    if (!bsgData) {
        await loadBsgData();
    }
    if (!presets) {
        await loadPresets();
    }
    if (!sptPresets) {
        await loadSptPresets();
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
            setBackgroundColor(item);
            try {
                hashCalc.init(bsgData, sptPresets, presets);
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
        const hashes = Object.keys(iconData);
        for (let i = 0; i < hashes.length; i++) {
            const hash = hashes[i];
            try {
                console.log(`Processing ${i + 1}/${hashes.length}`);
                if (!itemsByHash[hash]) {
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
