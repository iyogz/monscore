const fs = require('fs');
const ethers = require('ethers');
const axios = require('axios');
const blessed = require('blessed');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const userAgents = require('user-agents');

const screen = blessed.screen({ smartCSR: true, title: 'Auto Bot Monad Score' });

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

const BASE_URL = 'https://mscore.onrender.com';
const MAX_RETRIES = 3;

let REFERRAL_CODE = fs.existsSync('code.txt') ? fs.readFileSync('code.txt', 'utf-8').trim() : '';
if (!REFERRAL_CODE) logs.log('{red-fg}Error: No referral code in code.txt{/red-fg}');

let proxies = [];
try {
    if (fs.existsSync('./proxies.txt')) {
        const proxiesContent = fs.readFileSync('./proxies.txt', 'utf8');
        proxies = proxiesContent
            .split('\n')
            .map(proxy => proxy.trim())
            .filter(proxy => proxy && !proxy.startsWith('#'));
        console.log(`🌐 Loaded ${proxies.length} proxies from proxies.txt`);
    }
} catch (error) {
    console.error('\x1b[33m%s\x1b[0m', `⚠️ Error loading proxies.txt: ${error.message}`);
}

function createProxyAgent(proxyString) {
    if (!proxyString) return null;
    try {
        if (proxyString.startsWith('socks://') || proxyString.startsWith('socks4://') || proxyString.startsWith('socks5://')) {
            return new SocksProxyAgent(proxyString);
        }
        let formattedProxy = proxyString;
        if (!formattedProxy.includes('://')) {
            if (formattedProxy.includes('@') || !formattedProxy.match(/^\d+\.\d+\.\d+\.\d+:\d+$/)) {
                formattedProxy = `http://${formattedProxy}`;
            } else {
                const [host, port] = formattedProxy.split(':');
                formattedProxy = `http://${host}:${port}`;
            }
        }
        return new HttpsProxyAgent(formattedProxy);
    } catch (error) {
        console.error('\x1b[33m%s\x1b[0m', `⚠️ Error creating proxy agent for ${proxyString}: ${error.message}`);
        return null;
    }
}

function getRandomUserAgent() {
    const ua = new userAgents({ deviceCategory: 'desktop' });
    return ua.toString();
}

const generateWallet = () => ethers.Wallet.createRandom();
const saveWallets = (wallets) => fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 2));

function updateWalletsDisplay() {
    const wallets = fs.existsSync('wallets.json') ? JSON.parse(fs.readFileSync('wallets.json')) : [];
    walletsBox.setContent(wallets.map(w => w.address).join('\n'));
    screen.render();
}

async function makeRequest(method, url, data, retries = 0) {
    let proxy = retries < MAX_RETRIES && proxies.length ? createProxyAgent(proxies[Math.floor(Math.random() * proxies.length)]) : null;

    try {
        const config = {
            method,
            url,
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'origin': 'https://monadscore.xyz',
                'referer': 'https://monadscore.xyz/'
            },
            data,
            timeout: 15000,
            ...(proxy ? { httpAgent: proxy, httpsAgent: proxy } : {})
        };

        const res = await axios(config);
        logs.log(`- Proxy Used: ${proxy ? proxies.find(p => p.includes(proxy.proxy)) : 'None'}`);
        return res.data;
    } catch (e) {
        if (retries < MAX_RETRIES) {
            logs.log(`- Proxy failed: ${e.message}, retry ${retries + 1}/${MAX_RETRIES}`);
            return makeRequest(method, url, data, retries + 1);
        }
        logs.log(`- All retries failed: ${e.message}`);
        return null;
    }
}

async function registerWallet(walletAddress) {
    if (!REFERRAL_CODE) return logs.log('{red-fg}Error: No referral code{/red-fg}');
    return await makeRequest('post', `${BASE_URL}/user`, { wallet: walletAddress, invite: REFERRAL_CODE });
}

async function startNode(walletAddress) {
    return await makeRequest('put', `${BASE_URL}/user/update-start-time`, { wallet: walletAddress, startTime: Date.now() });
}

async function startProgram() {
    let total = 0, success = 0, failed = 0;

    if (!REFERRAL_CODE) {
        logs.log('{red-fg}Cannot start: No referral code{/red-fg}');
        return;
    }

    logs.log(`Using referral code: ${REFERRAL_CODE}`);
    if (proxies.length > 0) logs.log(`Loaded ${proxies.length} proxies`);

    const count = 5; // Example: Generate 5 wallets
    total = count;

    let wallets = fs.existsSync('wallets.json') ? JSON.parse(fs.readFileSync('wallets.json')) : [];

    for (let i = 0; i < count; i++) {
        const wallet = generateWallet();
        logs.log(`#${i + 1}/${count}: ${wallet.address.slice(0, 8)}...`);

        const reg = await registerWallet(wallet.address);
        if (reg?.success) {
            logs.log(`- Registered: OK`);
            const start = await startNode(wallet.address);
            if (start?.success) {
                logs.log(`- Node Started: OK`);
                success++;
                wallets.push({ address: wallet.address, privateKey: wallet.privateKey, createdAt: new Date().toISOString() });
                saveWallets(wallets);
                updateWalletsDisplay();
            } else {
                logs.log(`- Node Start: FAIL`);
                failed++;
            }
        } else {
            logs.log(`- Register: FAIL`);
            failed++;
        }

        stats.setContent(`Total: ${total}\nSuccess: ${success}\nFailed: ${failed}`);
        screen.render();
    }

    logs.log(`{cyan-fg}Done!{/cyan-fg}`);
    screen.render();
}

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

updateWalletsDisplay();
screen.render();
startProgram();
