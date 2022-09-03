#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
const EventEmitter = require('events');
const got = require('got');

const uploadImages = require('./upload-images');
const hashCalc = require('./hash-calculator');
const getJson = require('./get-json');
const imageFunctions = require('./image-functions');

let bsgData = false;
let presets = false;
let bsgPresets = false;
const itemsByHash = {};
const itemsById = {};

const iconCacheFolder = process.env.LOCALAPPDATA+'\\Temp\\Battlestate Games\\EscapeFromTarkov\\Icon Cache\\live\\'
let iconData = {};

const getIcon = async (filename, item, options) => {
    if (!item) {
        console.log(`No item provided for ${filename}`);
        return Promise.reject(new Error(`No item provided for ${filename}`));
    }

    const filepath = path.join(options.filePath || iconCacheFolder, filename);

    if (!options.response.generated[item.id]) options.response.generated[item.id] = [];
    if (!options.response.uploaded[item.id]) options.response.uploaded[item.id] = [];
    if (!options.response.uploadErrors[item.id]) options.response.uploadErrors[item.id] = [];

    // create base image
    const baseImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsBaseImage) {
            return resolve(true);
        }
        resolve(imageFunctions.createBaseImage(filepath, item).then(result => {
            options.response.generated[item.id].push('base');
            if (item.needsBaseImage && options.upload){
                console.log(`${item.id} should be uploaded for base-image`);
                fs.copyFileSync(result.path, path.join('./', 'generated-images-missing', `${item.id}-base-image.png`));
            }
            return {path: result.path, type: 'base'};
        }));
    });

    // create icon
    const iconPromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsIconImage) {
            return resolve(true);
        }
        resolve(imageFunctions.createIcon(filepath, item).then(result => {
            options.response.generated[item.id].push('icon');
            if (item.needsIconImage && options.upload) {
                console.log(`${item.id} should be uploaded for icon`);
                fs.copyFileSync(result.path, path.join('./', 'generated-images-missing', `${item.id}-icon.jpg`));
            }
            return {path: result.path, type: 'icon'};
        }));
    });

    // create grid image
    const gridImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsGridImage) {
            return resolve(true);
        }
        resolve(imageFunctions.createGridImage(filepath, item).then(result => {
            options.response.generated[item.id].push('grid image');
            if (item.needsGridImage && options.upload) {
                console.log(`${item.id} should be uploaded for grid-image`);
                fs.copyFileSync(result.path, path.join('./', 'generated-images-missing', `${item.id}-grid-image.jpg`));
            }
            return {path: result.path, type: 'grid'};
        }));
    });

    // create large image
    const largeImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsLargeImage) {
            return resolve(true);
        }
        resolve(imageFunctions.createLargeImage(filepath, item).then(result => {
            options.response.generated[item.id].push('large image');
            if (item.needsLargeImage && options.upload) {
                console.log(`${item.id} should be uploaded for large image`);
                fs.copyFileSync(result.path, path.join('./', 'generated-images-missing', `${item.id}-large.png`));
            }
            return {path: result.path, type: 'large'};
        }).catch(error => {
            console.log(`Error creating large image for ${item.id}`, error);
            return false;
        }));
    });
    return Promise.all([baseImagePromise, iconPromise, gridImagePromise, largeImagePromise]).then(results => {
        return results.filter(Boolean);
    });
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

const loadBsgData = async (options) => {
    if (options && options.bsgItems) {
        bsgData = options.bsgItems;
        return;
    }
    bsgData = await getJson.items();
};

const loadPresets = async (options) => {
    if (options && options.tdPresets) {
        presets = options.tdPresets;
        return;
    }
    presets = await getJson.td_presets();
};

const loadBsgPresets = async (options) => {
    if (options && options.bsgPresets) {
        bsgPresets = options.bsgPresets;
        return;
    }
    bsgPresets = await getJson.presets();
};

const setBackgroundColor = (item) => {
    item.backgroundColor = 'default';
    if (bsgData && bsgData[item.id]) {
        if (bsgData[item.id]._props) {
            if (imageFunctions.colors[bsgData[item.id]._props.BackgroundColor]) {
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
                  name
                  shortName
                  iconLink
                  gridImageLink
                  backgroundColor
                  types
                  width
                  height
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
    await loadBsgData(opts);
    await loadPresets(opts);
    await loadBsgPresets(opts);
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
        await loadBsgData(options);
    }
    if (!presets) {
        await loadPresets(options);
    }
    if (!bsgPresets) {
        await loadBsgPresets(options);
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
    },
    getImagesFromSource: getIcon,
    imageFunctions: imageFunctions
};
