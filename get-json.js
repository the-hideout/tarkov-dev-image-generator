const fs = require('fs');

const got = require('got');

const api = require('./scanner-api');

module.exports = {
    items: async () => {
        let items = false;
        try {
            items = JSON.parse(fs.readFileSync('./items.json', 'utf8'));
            const stats = fs.statSync('./items.json');
            if (Date.now() - stats.mtimeMs > 1000*60*60*2) {
                throw new Error('stale');
            }
        } catch (error) {
            try {
                if (process.env.API_USERNAME && process.env.API_PASSWORD && process.env.SCANNER_NAME) {
                    items = await api.getJson('items.json').catch(() => { return false; });
                }
                if (!items) {
                    console.log('Downloading SPT item data');
                    items = JSON.parse((await got('https://dev.sp-tarkov.com/SPT-AKI/Server/raw/branch/development/project/assets/database/templates/items.json')).body);
                }
                fs.writeFileSync('./items.json', JSON.stringify(items, null, 4));
            } catch (downloadError) {
                if (error.message != 'stale') {
                    return Promise.reject(downloadError);
                }
            }
        }
        return items;
    },
    presets: async () => {
        let presets = false;
        try {
            presets = JSON.parse(fs.readFileSync('./presets.json', 'utf8'));
            const stats = fs.statSync('./presets.json');
            if (Date.now() - stats.mtimeMs > 1000*60*60*2) {
                throw new Error('stale');
            }
        } catch (error) {
            try {
                if (process.env.API_USERNAME && process.env.API_PASSWORD && process.env.SCANNER_NAME) {
                    presets = await api.getJson('globals.json').catch(() => { return false; });
                    if (presets) presets = presets['ItemPresets'];
                } 
                if (!presets) {
                    console.log('Downloading SPT preset data');
                    presets = JSON.parse((await got('https://dev.sp-tarkov.com/SPT-AKI/Server/raw/branch/development/project/assets/database/globals.json')).body)['ItemPresets'];
                }
                fs.writeFileSync('./presets.json', JSON.stringify(presets, null, 4));
            } catch (downloadError) {
                if (error.message != 'stale') {
                    return Promise.reject(downloadError);
                }
            }
        }
        return presets;
    },
    td_presets: async () => {
        let presets = false;
        try {
            presets = JSON.parse(fs.readFileSync('./item_presets.json', 'utf8'));
            const stats = fs.statSync('./item_presets.json');
            if (Date.now() - stats.mtimeMs > 1000*60*60*2) {
                throw new Error('stale');
            }
        } catch (error) {
            try {
                if (process.env.API_USERNAME && process.env.API_PASSWORD && process.env.SCANNER_NAME) {
                    downloadedPresets = await api.getJson('presets.json').catch(() => { return false; });
                    if (downloadedPresets) presets = downloadedPresets;
                } 
                if (!presets) throw new Error('Error downloading Tarkov.dev presets');
                fs.writeFileSync('./item_presets.json', JSON.stringify(presets, null, 4));
            } catch (downloadError) {
                if (error.message != 'stale') {
                    return Promise.reject(downloadError);
                }
            }
        }
        return presets;
    }
}