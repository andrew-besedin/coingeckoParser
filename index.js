const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const config = require("./config.json");
const { CronJob } = require('cron');
const path = require("path");
const { app, BrowserWindow, ipcMain } = require('electron');

async function trySolve(page, counter) {
    try {
        try {
            await page.waitForSelector("iframe");
        } catch(err) {
            return { success: false, error: "No IFrame" };
        }
        
        
        await new Promise(res => setTimeout(res, 500));
        const formFrame = await (await page.$('iframe')).contentFrame();
        await formFrame.waitForSelector('.captcha__human__captcha-container > div > div');
        await formFrame.evaluate(() => document.querySelector('.captcha__human__captcha-container > div > div').click());
        await formFrame.waitForSelector('[aria-label="Vision Impaired"]');
        
        await new Promise(res => setTimeout(res, 500));
        await formFrame.evaluate(() => document.querySelector('[aria-label="Vision Impaired"]').click());
        await formFrame.waitForSelector('.geetest_music[src]');

        

        const voiceBuffer = await formFrame.evaluate(async () => {
            const src = document.querySelector('.geetest_music').getAttribute('src');
            const response = await window.fetch(src);
            const buffer = await response.arrayBuffer();
            return Array.from(new Uint8Array(buffer));
        });

        


        const voiceData = await Promise.race([
            fetch('https://api.wit.ai/speech', {
                method: 'POST', 
                body: new Uint8Array(voiceBuffer).buffer,
                headers: {
                    Authorization: 'Bearer IYBAUN2BZ5G3OY3O4XX4IIPLFGHYCQDL',
                    'Content-Type': 'audio/mpeg3'
                }
            }), 
            new Promise((_, rej) => setTimeout(rej, 20000))
        ]);
        const text = await voiceData.text();
        const code = text.split(`text": "`).at(-1).split('"')[0].replace(/\D/g, "");

        await formFrame.evaluate((code) => {
            document.querySelector('.geetest_input').value = code
        }, code);
        await new Promise(res => setTimeout(res, 300));
        await formFrame.click('.geetest_btn[aria-label="OK"]');
        await new Promise(res => setTimeout(res, 3000));
        const isFailed = await formFrame.evaluate(() => !!document.querySelector(`[aria-label="Sorry, it doesn't match."]`));
        if (isFailed) {
            await page.reload();
            if (counter <= 30) {
                return trySolve(page, counter + 1);
            } else {
                return { success: false, error: "Stack Overflow" }
            }
            
            
        } else {
            return { success: true };
        }

    } catch (err) {
        await page.reload();
        if (counter <= 30) {
            return trySolve(page, counter + 1);
        } else {
            return { success: false, error: "Stack Overflow" }
        }
    }
};

async function signUp(page, account) {
    await page.waitForSelector("#sign-in-button", { timeout: 10000 });
    await page.type("#signInEmail", account.login);
    await new Promise(res => setTimeout(res, 500));
    await page.type("#signInPassword", account.password);
    await new Promise(res => setTimeout(res, 1000));
    const loginButton = await page.waitForSelector('#sign-in-button');
    await page.evaluate(() => {
        document.querySelector('#sign-in-button').click();
    });
}




(async () => {
    await app.whenReady();
    const win = new BrowserWindow({
        width: 500,
        height: 500,
        autoHideMenuBar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'public/main.js')
        }
    });
    async function log(data) {
        win.webContents.send('log', data.toString());
    }
    await win.loadFile(path.join(__dirname, 'public/index.html'));
    await main(log);
    const job = new CronJob("0 0 1 * * *", () => main(log), null, false, "UTC");
    job.start();
})();



async function main(log) {
    log((new Date()).toString().split("(")[0]);
    for (let account of config) {
        for (let i = 1; i <= 3; i ++) {
            let browser;
            try {
                browser = await puppeteer.launch({
                    // headless: false,
                    slowMo: 50,
                    args: [
                        '--lang="en-US"',
                        account.proxy ? `--proxy-server=http://${account.proxy}` : ""
                    ]
                });
                const page = (await browser.pages())[0];
                await page.setUserAgent( 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36' );
                if (account.proxy && account.proxyLogin && account.proxyPass) {
                    await page.authenticate({ username: account.proxyLogin, password: account.proxyPass });
                }
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en'
                });
                await page.goto("https://www.coingecko.com/", { timeout: 100000, waitUntil: 'domcontentloaded' });
                
                await page.waitForSelector('[data-target="#signInModal"]', { timeout: 100000 });
                
                await new Promise(res => setTimeout(res, 10000));
                await page.evaluate(() => {
                    document.querySelector('[data-target="#signInModal"]').click();
                });
                await new Promise(res => setTimeout(res, 2000));
                await signUp(page, account);
                await page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 100000});   
                await new Promise(res => setTimeout(res, 2000));
                if (!(await page.$('[data-target="#mobile-user-menu-right"]'))) {
                    
                    const answer = await trySolve(page, 1);
                    if (!answer.success) {
                        if (answer.error == "No IFrame") {
                            throw new Error("Proxy is banned on coingecko.com");
                        }
                        if (answer.error == "Stack Overflow") {
                            throw new Error("Stack overflow while solving capcha");
                        }
                    }
                    await new Promise(res => setTimeout(res, 10000));
                }
                await page.goto("https://www.coingecko.com//account/candy?locale=en", { timeout: 100000, waitUntil: 'domcontentloaded' });
                await new Promise(res => setTimeout(res, 5000));
                await signUp(page, account).catch(() => {});
                await new Promise(res => setTimeout(res, 3000));
                
                const button = await page.waitForSelector("button.collect-candy-button", { timeout: 7000 }).catch(() => false);
                if (button) {
                    await new Promise(res => setTimeout(res, 1000));
                    await page.evaluate(() => {
                        try {
                            document.querySelector("button.collect-candy-button").click();
                        } catch {}
                    });
                }
                    
                await new Promise(res => setTimeout(res, 5000));
                
                const coinsAmount = await page.evaluate(() => document.querySelector('[data-target="points.balance"]').textContent);
                log(account.login + ': ' + coinsAmount);
                
                await browser.close();
                break;
            } catch(err) {
                try {
                    await browser.close();
                } catch {}
                log("Collection error: " + account.login);
                log(err);
            }
        }
    }
};