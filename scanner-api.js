const fs = require('fs');
const { setTimeout } = require('timers/promises');

const FormData = require('form-data');

const API_URL = 'https://manager.tarkov.dev/api/scanner';
//const API_URL = 'http://localhost:4000/api/scanner';

const sleep = async (ms) => {
    return setTimeout(ms, true).catch(err => {
        return Promise.resolve(true);
    });
};

const apiRequest = async (endpoint, method, options, retries) => {
    if (!retries) retries = 0;
    try {
        const response = await fetch(API_URL+'/'+endpoint, {
            body: options ? JSON.stringify(options) : undefined,
            headers: {
                username: process.env.API_USERNAME,
                password: process.env.API_PASSWORD,
                scanner: process.env.SCANNER_NAME
            },
            method: method,
            retry: {
                limit: 10,
                calculateDelay: () => {
                    return 500;
                }
            }
        });
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        if (retries > 10) {
            return Promise.reject(error);
        }
        await sleep(500);
        return apiRequest(endpoint, method, options, retries+1);
    }
};

module.exports = {
    ping: async () => {
        try {
            const result = await apiRequest('ping', 'GET');
            if (result.errors.length > 0) {
                for (let i = 0; i < result.errors.length; i++) {
                    logger(chalk.red(`Error pinging API: ${result.errors[i]}`));
                }
                return Promise.reject(new Error(result.errors[0]));
            }
        } catch (error) {
            return Promise.reject(error);
        }
    },
    connected: async () => {
        try {
            await module.exports.ping();
        } catch (error) {
            return false;
        }
        return true;
    },
    getJson: async (filename) => {
        try {
            const result = await apiRequest('json', 'GET', {file: filename});
            if (result.errors.length > 0) {
                for (let i = 0; i < result.errors.length; i++) {
                    logger(chalk.red(`Error getting JSON: ${result.errors[i]}`));
                }
                return Promise.reject(new Error(result.errors[0]));
            }
            return result.data;
        } catch (error) {
            return Promise.reject(error);
        }
    },
    submitImage: async (itemId, imageType, filePath, overwrite = false) => {
        let bufferStream = false;
        filePath = await filePath;
        if (typeof filePath === 'string') {
            bufferStream = fs.createReadStream(filePath);
        } else {
            bufferStream = filePath;
        }
        const form = new FormData();
        form.append('id', itemId);
        form.append('type', imageType);
        form.append(imageType, bufferStream);
        form.append('overwrite', String(overwrite));

        return fetch(API_URL + '/image', {
            method: 'POST',
            body: form,
            headers: {
                username: process.env.API_USERNAME,
                password: process.env.API_PASSWORD,
            },
        }).then(response => response.json());
    }
};
