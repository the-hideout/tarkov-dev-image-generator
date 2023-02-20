const path = require('path');

const Jimp = require('jimp-compact');
const sharp = require('sharp');
const htmlEntities = require('html-entities');

process.env.FONTCONFIG_PATH = path.join(__dirname, 'fonts');

const colors = {
    black: {r: 0, g: 0, b: 0, alpha: 77/255},
    blue: {r: 28, g: 65, b: 86, alpha: 77/255},
    default: {r: 127, g: 127, b: 127, alpha: 77/255},
    green: {r: 21, g: 45, b: 0, alpha: 77/255},
    grey: {r: 29, g: 29, b: 29, alpha: 77/255},
    orange: {r: 60, g: 25, b: 0, alpha: 77/255},
    red: {r: 109, g: 36, b: 24, alpha: 77/255},
    violet: {r: 76, g: 42, b: 85, alpha: 77/255},
    yellow: {r: 104, g: 102, b: 40, alpha: 77/255},
};

const imageSizes = {
    icon: {
        append: 'icon',
        field: 'icon_link',
        format: 'webp',
    },
    'base-image': {
        append: 'base-image',
        field: 'base_image_link',
        format: 'webp'
    },
    'grid-image': {
        append: 'grid-image',
        field: 'grid_image_link',
        format: 'webp'
    },
    image: {
        append: 'image',
        field: 'image_link',
        format: 'webp'
    },
    '512': {
        append: '512',
        field: 'image_512_link',
        format: 'webp'
    },
    '8x': {
        append: '8x',
        field: 'image_8x_link',
        format: 'webp',
        formatOptions: {lossless: true},
    },
};

const imageFormats = {
    jpg: {
        contentType: 'image/jpeg',
    },
    png: {
        contentType: 'image/png',
    },
    webp: {
        contentType: 'image/webp',
    }
};
for (const imgSize of Object.values(imageSizes)) {
    imgSize.contentType = imageFormats[imgSize.format].contentType;
}

const getSharp = async (input, clone = true) => {
    if (typeof input === 'string') {
        return sharp(input);
    }
    if (input.constructor.name === 'Jimp') {
        return sharp(await input.getBufferAsync(Jimp.AUTO));
    }
    if (!clone)
        return input;
    return sharp(await input.toBuffer());
}

const getShadow = async (image) => {
    image = (await Jimp.read(await image.toBuffer()));
    image.shadow({opacity: 0.8, size: 1, blur: 2, x: 0, y: 0});
    return sharp(await image.getBufferAsync(Jimp.AUTO));
};

const getChecks = async (width, height, itemBackgroundColor) => {
    const itemColor = colors[itemBackgroundColor];
    if (!itemColor){
        return Promise.reject(new Error(`No background color found for ${itemBackgroundColor}`));
    }
    let canvas = sharp({create: {
        width: width,
        height: height,
        channels: 4,
        background: {r: 0, g: 0, b: 0, alpha: 1},
    }}).png();
    let background = sharp({create: {
        width: width,
        height: height,
        channels: 4,
        background: itemColor
    }}).png();
    canvas = await canvas.composite([
        {
            input: await sharp(path.join(__dirname, 'grid_cell.png')).toBuffer(),
            tile: true,
            gravity: 'southwest',
        },
        {
            input: await background.toBuffer()
        }
    ]).toBuffer();
    canvas = sharp(canvas);
    return canvas.png();
};

const getBorder = async (width, height) => {
    const canvas = sharp({create: {
        width: width,
        height: height,
        channels: 4,
        background: {r: 0, g: 0, b: 0, alpha: 0},
    }});
    canvas.extract({left: 1, top: 1, width: width - 2, height: height - 2});
    canvas.extend({top: 1, right: 1, bottom: 1, left: 1, background: {r: 73, g: 81, b: 84, alpha: 1}});
    return canvas.png();
};

const getItemGridSize = (item) => {
    if (item.width && item.height) {
        return {width: (item.width * 63) + 1, height: (item.height * 63) + 1};
    }
    return false;
};

const resizeToGrid = async (image, item) => {
    if (image.constructor.name === 'Sharp') {
        image = await image.metadata();
    } else {
        image = image.bitmap;
    }
    const gridSize = getItemGridSize(item);
    if (gridSize) {
        if (image.width !== gridSize.width || image.height !== gridSize.height) {
            return gridSize;
        }
    }
    return false;
};

const getTextImage = async (metadata, text, fontSize = 12) => {
    if (!text) {
        return Promise.reject(new Error('You must provide text to print on the image'));
    }
    const svgText = `
        <svg>
            <style>
                .name-text {
                    font-size: ${fontSize}px;
                    font-family: Bender;
                    font-weight: bold;
                    paint-order: stroke;
                    stroke: #000000;
                    stroke-width: 2px;
                    stroke-linecap: butt;
                    stroke-linejoin: miter;
                }
            </style>
            <text x="0" y="9" fill="#a4aeb4" class="name-text">${htmlEntities.encode(text)}</text>
        </svg>
    `;
    const textImg = sharp(Buffer.from(svgText)).png();
    const textMeta = await textImg.metadata();
    if (textMeta.width <= metadata.width-1) {
        return textImg;
    }
    return false;
};

const addImageMeta = (image, item, imageType) => {
    image.withMetadata({
        exif: {
            IFD0: {
                Software: 'tarkov-dev-image-generator',
                ID: item.id,
                Name: item.name,
                ShortName: item.shortName,
                ImageType: imageType,
                XPSubject: item.id,
                XPTitle: item.name,
                XPComment: item.shortName,
                XPKeywords: imageType,
            }
        }
    });
};

const outputFormat = (image, imageType, item) => {
    const size = imageSizes[imageType];
    if (!size) {
        return Promise.reject(new Error(`${imageType} is not a valid image type`));
    }
    if (item) {
        addImageMeta(image, item, imageType);
    }
    const defaultFormatOptions = {
        jpg: {quality: 100, chromaSubsampling: '4:4:4'},
        png: {compressionLevel: 9},
        webp: {lossless: true},
    };
    const format = size.format;
    const arguments = size.formatOptions || defaultFormatOptions[format];
    if (format === 'jpg') {
        return image.jpeg(arguments);
    }
    if (format === 'png') {
        return image.png(arguments);
    }
    if (format === 'webp') {
        return image.webp(arguments);
    }
    return Promise.reject(new Error(`Unrecognized image format: ${format}`));
};

const createIcon = async (sourceImage, item) => {
    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    if (metadata.width < 64 || metadata.height < 64) {
        return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; icon requires at least 64x64`));
    }
    if (metadata.width !== 64 || metadata.height !== 64) {
        sourceImage = sourceImage.resize(64, 64, {fit: 'inside'});
    }
    sourceImage = await getShadow(sourceImage);
    sourceImage = await sourceImage.toBuffer();
    const icon = await getChecks(64, 64, item.backgroundColor).then(async background => {
        const buffer = await background.composite([{
            input: sourceImage,
        }]).toBuffer();
        return sharp(buffer);
    }).then(async withItemImage => {
        const buffer = await withItemImage.composite([{
            input: await (await getBorder(64, 64)).toBuffer(),
        }]).toBuffer();
        return sharp(buffer);
    });
    //return icon.jpeg({quality: 100, chromaSubsampling: '4:4:4'});
    return outputFormat(icon, 'icon');
};

const createGridImage = async (sourceImage, item) => {
    let gridSize = getItemGridSize(item);
    if (!gridSize) {
        return Promise.reject(new Error(`Dimensions missing for ${item.name} ${item.id}`));
    }

    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    if (metadata.width !== gridSize.width || metadata.height !== gridSize.height) {
        if (metadata.width < gridSize.width || metadata.height < gridSize.height) {
            return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; grid image requires at least ${resize.width}x${resize.height}`));
        }
        sourceImage = sharp(await sourceImage.resize(gridSize.width, gridSize.height, {fit: 'inside'}).toBuffer());
    }
    sourceImage = await getShadow(sourceImage);
    sourceImage = await sourceImage.toBuffer();

    let gridImage = await getChecks(gridSize.width, gridSize.height, item.backgroundColor).then(async background => {
        const buffer = await background.composite([{
            input: sourceImage,
        }]).toBuffer();
        return sharp(buffer);
    }).then(async withItemImage => {
        const buffer = await withItemImage.composite([{
            input: await (await getBorder(gridSize.width, gridSize.height)).toBuffer(),
        }]).toBuffer();
        return sharp(buffer);
    });

    let shortName = false;
    if (item.shortName) {
        try {
            shortName = String(item.shortName);
            if (item.types && item.types.includes('preset')) {
                shortName = shortName.replace(/ (?:Default|По умолчанию|Por defecto|Par défaut|Výchozí|Alapértelmezett)$/, '')
            }
            shortName = shortName.replace(/\r/g, '').replace(/\n/g, '').trim();
        } catch (error) {
            console.log(`Error trimming shortName ${shortName} for ${JSON.stringify(item)}`);
            shortName = false;
        }
    } else {
        console.log(`No shortName for ${JSON.stringify(item)}`);
    }
    if (shortName) {
        let textImage = false;
        // first we try to add the full shortName in font sized 12-10
        for (let fontSize = 12; !textImage && fontSize > 9; fontSize--) {
            textImage = await getTextImage(gridSize, shortName, fontSize);
        }
        // if we haven't pritned the name, try truncating the shortName at the last
        // space or slash, whichever comes later
        let clippedName = shortName;
        while (!textImage && (clippedName.includes('/') || clippedName.includes(' '))) {
            const lastSpace = clippedName.lastIndexOf(' ');
            const lastSlash = clippedName.lastIndexOf('/');
            let cutoff = lastSpace;
            if (lastSlash > lastSpace) cutoff = lastSlash;
            if (cutoff == -1) break;
            clippedName = clippedName.substring(0, cutoff);
            for (let fontSize = 12; fontSize > 10 && !textImage; fontSize--) {
                textImage = await getTextImage(gridSize, clippedName, fontSize);
            }
        }
        // if we still haven't printed the name, drop one letter at a time and try on
        // font sizes 12-10 until something fits
        while (!textImage && clippedName.length > 0) {
            clippedName = clippedName.substring(0, clippedName.length-1);
            for (let fontSize = 12; fontSize > 10 && !textImage; fontSize--) {
                textImage = await getTextImage(gridSize, clippedName, fontSize);
            }
        }
        if (!textImage) {
            return Promise.reject(new Error(`Unable print shortName (${item.shortName}) on grid image for ${item.id}`));
        }
        const textMeta = await textImage.metadata();
        gridImage = sharp(await gridImage.toBuffer()).composite([{
            input: await textImage.toBuffer(),
            top: 4,
            left: gridSize.width-textMeta.width-1
        }]);
    }

    //return gridImage.jpeg({quality: 100, chromaSubsampling: '4:4:4'});
    return outputFormat(gridImage, 'grid-image');
};

const createBaseImage = async (image, item) => {
    image = await getSharp(image);
    const metadata = await image.metadata();
    if (!item.width || !item.height) {
        return Promise.reject(new Error(`Dimensions missing for ${item.name} ${item.id}`));
    }

    const resize = await resizeToGrid(image, item);
    if (resize) {
        if (metadata.width < resize.width || metadata.height < resize.height) {
            return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; base image requires at least ${resize.width}x${resize.height}`));
        }
        image.resize(resize.width, resize.height, {fit: 'contain'});
    }

    //return image.png({compressionLevel: 9});
    return outputFormat(image, 'base-image');
};

const canCreateInspectImage = async (image) => {
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width >= 512 || image.height >= 350) {
        return true;
    }
    return false;
};

const createInspectImage = async(sourceImage, item) => {
    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    if (!await canCreateInspectImage(metadata)) {
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is not large enough; must be at least 512px wide or 350px tall`));
    }

    if (metadata.width > 512 || metadata.height > 350) {
        sourceImage.resize(512, 350, {fit: 'inside'});
    }

    const inspectImage = sharp(path.join(__dirname, 'background.png'));

    inspectImage.composite([{input: await sourceImage.toBuffer()}]);

    //return inspectImage.jpeg({quality: 100});
    return outputFormat(inspectImage, 'image');
};

const canCreate512Image = async (image) => {
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width >= 512 || image.height >= 512) {
        return true;
    }
    return false;
};

const create512Image = async (image, item) => {
    image = await getSharp(image);
    const metadata = await image.metadata();

    if (!await canCreate512Image(metadata)) {
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is not large enough; must be at least 512px wide or tall`));
    }

    if (metadata.width > 512 || metadata.height > 512) {
        image.resize(512, 512, {fit: 'inside'});
    }

    //return image.webp({lossless: true});
    return outputFormat(image, '512');
};


const get8xSize = item => {
    const gridSize = getItemGridSize(item);
    if (gridSize) {
        return {width: gridSize.width * 8, height: gridSize.height * 8};
    }
    return false;
};

const canCreate8xImage = async (image, item) => {
    const targetSize = get8xSize(item);
    if (!targetSize) {
        return false;
    }
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width === targetSize.width && image.height === targetSize.height) {
        return true;
    }
    return false;
};

const create8xImage = async (image, item) => {
    if (!item.width || !item.height) {
        return Promise.reject(new Error(`Dimensions missing for ${item.name} ${item.id}`));
    }
    image = await getSharp(image);
    const metadata = await image.metadata();
    if (!await canCreate8xImage(image, item)) {
        const targetSize = get8xSize(item);
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is invalid for 8x; it is ${metadata.width}x${metadata.height} but must be ${targetSize.width}x${targetSize.height}`));
    }
    //return image.webp({lossless: true});
    return outputFormat(image, '8x');
};

const getImageName = (item, imageSize) => {
    if (!imageSizes[imageSize]) {
        throw new Error(`${imageSize} is not a valid image size`);
    }
    return `${item.id}-${imageSizes[imageSize].append}.${imageSizes[imageSize].format}`;
};

module.exports = {
    colors: colors,
    imageSizes: imageSizes,
    createIcon: createIcon,
    createGridImage: createGridImage,
    createBaseImage: createBaseImage,
    createInspectImage: createInspectImage,
    create512Image: create512Image,
    create8xImage: create8xImage,
    canCreate512Image: canCreate512Image,
    canCreateInspectImage: canCreateInspectImage,
    get8xSize: get8xSize,
    canCreate8xImage: canCreate8xImage,
    getImageName: getImageName,
};
