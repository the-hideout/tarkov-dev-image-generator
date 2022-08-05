const fs = require('fs');
const { setTimeout } = require('timers/promises');

const got = require('got');
const FormData = require('form-data');

//const API_URL = 'https://manager.tarkov.dev/api/scanner';
const API_URL = 'http://localhost:4000/api/scanner';

const sleep = async (ms) => {
    return setTimeout(ms, true).catch(err => {
        return Promise.resolve(true);
    });
};

const apiRequest = async (endpoint, method, options, retries) => {
    if (!retries) retries = 0;
    try {
        const {body} = await got(API_URL+'/'+endpoint, {
            json: options,
            responseType: 'json',
            headers: {
                username: process.env.API_USERNAME,
                password: process.env.API_PASSWORD,
                scanner: process.env.SCANNER_NAME
            },
            allowGetBody: true,
            method: method,
            retry: {
                limit: 10,
                calculateDelay: () => {
                    return 500;
                }
            }
        });
        return Promise.resolve(body);
    } catch (error) {
        let retry = false;
        const retryCodes = [
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNRESET'
        ];
        if (error.code && retryCodes.includes(error.code) && !settings.aborted()) {
            if (retries <= 10) {
                retry = true;
            }
        } else if (error.message === 'access denied') {
            retry = true;
        }
        if (retry) {
            await sleep(500);
            return apiRequest(endpoint, method, options, retries+1);
        }
        if (error.code && error.code === 'ERR_BODY_PARSE_FAILURE') {
            return Promise.reject(new Error('invalid api response'));
        }
        return Promise.reject(error);
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
    submitImage: async(itemId, imageType, filePath) => {
        const form = new FormData();
        form.append('id', itemId);
        form.append('type', imageType);
        form.append(imageType, fs.createReadStream(filePath));

        return got.post(API_URL + '/image', {
            body: form,
            headers: {
                username: process.env.API_USERNAME,
                password: process.env.API_PASSWORD,
            },
            responseType: 'json',
            resolveBodyOnly: true
        });
    }
};
