const fs = require('fs');
const ethers = require('ethers');
const axios = require('axios');
const blessed = require('blessed');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const userAgents = require('user-agents');

const screen = blessed.screen({
    smartCSR: true,
    title: 'Auto Bot Monad Score'
});

const banner = blessed.box({
    parent: screen,
    top: 0,
    left: 'center',
    width: '100%',
    height: 3,
    content: '{center}{bold}AUTO BOT MONADSCORE - AIRDROP INSIDERS{/bold}{/center}',
    tags: true,
    style: { fg: 'cyan' },
    border: { type: 'line', fg: 'white' }
});

const logs = blessed.log({
    parent: screen,
    top: 3,
    left: 0,
    width: '70%', 
    height: '96%', 
    label: ' Logs ',
    tags: true,
    border: { type: 'line', fg: 'white' },
    scrollable: true,
    scrollbar: { bg: 'blue' }
});

const stats = blessed.box({
    parent: screen,
    top: 3,
    right: 0,
    width: '30%',
    height: '30%',
    label: ' Stats ',
    tags: true,
    border: { type: 'line', fg: 'white' }
});

const walletsBox = blessed.box({
    parent: screen,
    top: '33%',
    right: 0,
    width: '30%',
    height: '67%',
    label: ' Wallets ',
    tags: true,
    border: { type: 'line', fg: 'white' },
    scrollable: true,
    scrollbar: { bg: 'blue' }
});

const prompt = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    height: 5,
    width: 25,
    border: 'line',
    hidden: true
});

const BASE_URL = 'https://mscore.onrender.com';
const MAX_RETRIES = 3;

let REFERRAL_CODE = '';
try {
    if (fs.existsSync('code.txt')) {
        REFERRAL_CODE = fs.readFileSync('code.txt', 'utf-8').trim();
    }
} catch (error) {
    logs.log(`{red-fg}Error reading code.txt: ${error.message}{/red-fg}`);
}

const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
};

function cleanHeaders(headers) {
    const cleanedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        cleanedHeaders[key] = typeof value === 'string' ? value.replace(/[^\x20-\x7E]/g, '') : value;
    }
    return cleanedHeaders;
}

let proxies = [];
try {
    if (fs.existsSync('proxies.txt')) {
        proxies = fs.readFileSync('proxies.txt', 'utf8')
            .split('\n')
            .map(proxy => proxy.trim())
            .filter(proxy => proxy && !proxy.startsWith('#'));
    }
} catch (error) {
    console.error(`⚠️ Error loading proxies.txt: ${error.message}`);
}

function createProxyAgent(proxyString) {
    if (!proxyString) return null;
    try {
        if (proxyString.startsWith('socks')) {
            return new SocksProxyAgent(proxyString);
        }
        return new HttpProxyAgent(proxyString.includes('://') ? proxyString : `http://${proxyString}`);
    } catch (error) {
        console.error(`⚠️ Error creating proxy agent: ${error.message}`);
        return null;
    }
}

function getRandomUserAgent() {
    const ua = new userAgents({ deviceCategory: 'desktop' });
    return ua.toString();
}

async function makeRequest(method, url, data, retries = 0) {
    try {
        const config = {
            method,
            url,
            headers: cleanHeaders(defaultHeaders),
            data,
            timeout: 15000
        };
        return await axios(config);
    } catch (e) {
        if (retries < MAX_RETRIES) {
            return makeRequest(method, url, data, retries + 1);
        }
        return null;
    }
}

async function registerWallet(walletAddress) {
    if (!REFERRAL_CODE) return null;
    return await makeRequest('post', `${BASE_URL}/user`, { wallet: walletAddress, invite: REFERRAL_CODE });
}

async function startNode(walletAddress) {
    return await makeRequest('put', `${BASE_URL}/user/update-start-time`, { wallet: walletAddress, startTime: Date.now() });
}

function startProgram() {
    if (!REFERRAL_CODE) return;
    prompt.show();
    prompt.input('Number of wallets:', '', async (err, value) => {
        prompt.hide();
        const count = parseInt(value);
        if (isNaN(count) || count <= 0) return;
        for (let i = 0; i < count; i++) {
            const wallet = ethers.Wallet.createRandom();
            const reg = await registerWallet(wallet.address);
            if (reg?.success) {
                await startNode(wallet.address);
            }
        }
    });
}

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

startProgram();
                             
updateWalletsDisplay();
screen.render();
startProgram();
