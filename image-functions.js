const fs = require('fs');
const path = require('path');
const Jimp = require('jimp-compact');

const fonts = {};

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

const getChecks = (width, height, itemColors) => {
    const checks = new Jimp(width, height);
    checks.scan(0, 0, width, height, function(x, y) {
        checks.setPixelColor(Jimp.cssColorToHex(itemColors[(x + y) % 2]), x, y);
    });
    return checks;
};

const resizeToGrid = (image, item) => {
    if (item.width && item.height) {
        const properWidth = item.width > 1 ? (item.width * 64) - item.width+1 : 64;
        const properHeight = item.height > 1 ? (item.height * 64) - item.height+1 : 64;
        if (image.bitmap.width !== properWidth || image.bitmap.height !== properHeight) {
            return {width: properWidth, height: properHeight};
        }
    }
    return false;
};

const getFont = async (fontSize = 12) => {
    if (!fonts[fontSize]) {
        fonts[fontSize] = await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-${fontSize}.fnt`));
    }
    return fonts[fontSize];
};

const createIcon = async (filepath, item) => {
    const itemColors = colors[item.backgroundColor];

    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    const image = await Jimp.read(filepath);
    image
        .scaleToFit(64, 64)
        .contain(64, 64)
        .crop(1, 1, 62, 62)
        .composite(getChecks(62, 62, itemColors), 0, 0, {
            mode: Jimp.BLEND_DESTINATION_OVER,
        });

    const iconPath = path.join('./', 'generated-images', `${item.id}-icon.jpg`);
    await image.writeAsync(iconPath);
    return {path: iconPath, image: image};
};

const createGridImage = async (filepath, item) => {
    const itemColors = colors[item.backgroundColor];

    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    const image = await Jimp.read(filepath);
    const resize = resizeToGrid(image, item);
    if (resize) {
        //console.log(`Resizing ${item.name} ${item.id} from ${image.bitmap.width}x${image.bitmap.height} to ${resize.width}x${resize.height} for grid image`);
        image.scaleToFit(resize.width, resize.height);
    }
    image.composite(getChecks(image.bitmap.width, image.bitmap.height, itemColors), 0, 0, {
        mode: Jimp.BLEND_DESTINATION_OVER,
    });

    let shortName = item.shortName+'';
    if (shortName) {
        try {
            shortName = shortName.trim().replace(/\r/g, '').replace(/\n/g, '');
        } catch (error) {
            console.log(`Error trimming shortName ${shortName} for ${JSON.stringify(item)}`);
            shortName = false;
        }
    } else {
        console.log(`No shortName for ${JSON.stringify(item)}`);
    }
    if (shortName) {
        let namePrinted = false;
        let textWidth = image.bitmap.width;
        for (let fontSize = 12; !namePrinted && fontSize > 9; fontSize--) {
            const font = await getFont(fontSize);
            try {
                textWidth = Jimp.measureText(font, shortName);
                if (textWidth <= image.bitmap.width-2) {
                    image.print(font, image.bitmap.width-textWidth-2, 2, {
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
        }
        let clippedName = shortName;
        while (!namePrinted && (clippedName.includes('/') || clippedName.includes(' '))) {
            const lastSpace = clippedName.lastIndexOf(' ');
            const lastSlash = clippedName.lastIndexOf('/');
            let cutoff = lastSpace;
            if (lastSlash > lastSpace) cutoff = lastSlash;
            if (cutoff == -1) break;
            clippedName = clippedName.substring(0, cutoff);
            for (let fontSize = 12; fontSize > 10 && !namePrinted; fontSize--) {
                let font = await getFont(fontSize);
                try {
                    textWidth = Jimp.measureText(font, clippedName);
                    if (textWidth <= image.bitmap.width-2) {
                        image.print(font, image.bitmap.width-textWidth-2, 2, {
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
            }
        }
        while (!namePrinted && clippedName.length > 0) {
            clippedName = clippedName.substring(0, clippedName.length-1);
            for (let fontSize = 12; fontSize > 10 && !namePrinted; fontSize--) {
                let font = await getFont(fontSize);
                try {
                    textWidth = Jimp.measureText(font, clippedName);
                    if (textWidth <= image.bitmap.width-2) {
                        image.print(font, image.bitmap.width-textWidth-2, 2, {
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

    const gridImagePath = path.join('./', 'generated-images', `${item.id}-grid-image.jpg`);
    await image.writeAsync(gridImagePath);

    return {path: gridImagePath, image: image};
};

const createBaseImage = async (filepath, item) => {
    const image = await Jimp.read(filepath);

    const resize = resizeToGrid(image, item);
    if (resize) {
        //console.log(`Resizing ${item.name} ${item.id} from ${image.bitmap.width}x${image.bitmap.height} to ${resize.width}x${resize.height} for base image`);
        image.scaleToFit(resize.width, resize.height);
    }

    const baseImagePath = path.join('./', 'generated-images', `${item.id}-base-image.png`);
    await image.writeAsync(baseImagePath);

    return {path: baseImagePath, image: image};
};

const createLargeImage = async(filepath, item) => {
    const image = await Jimp.read(filepath);

    if (image.bitmap.width < 512 && image.bitmap.height < 512) {
        return Promise.reject(`${filepath} for ${item.name} ${item.id} is not large enough, must be at least 512px wide or tall`);
    }

    if (image.bitmap.width > 512 || image.bitmap.height > 512) {
        let newWidth = Jimp.AUTO;
        let newHeight = Jimp.AUTO;
        if (image.bitmap.width > image.bitmap.height) {
            newWidth = 512;
        } else if (image.bitmap.height > image.bitmap.width) {
            newHeight = 512;
        } else {
            newWidth = 512;
            newHeight = 512;
        }
        image.resize(newWidth, newHeight);
    }

    const largeImagePath = path.join('./', 'generated-images', `${item.id}-large.png`);
    await image.writeAsync(largeImagePath);

    return {path: largeImagePath, image: image};
};

module.exports = {
    colors: colors,
    createIcon: createIcon,
    createGridImage: createGridImage,
    createBaseImage: createBaseImage,
    createLargeImage: createLargeImage
};
