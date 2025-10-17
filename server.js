const express = require('express');
const path = require('path');
const spawn = require('cross-spawn');
const fetch = global.fetch; // Node 22+
const fs = require('fs');

const app = express();
const PORT = 3000;

let yacyProcess = null;

// Serve static files
app.use(express.static(path.join(__dirname, 'www')));

// Serve loading page
app.get('/loading', (req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'loading.html'));
});

// Check if YaCy is running
async function isYaCyRunning() {
    try {
        const res = await fetch('http://localhost:8090/Status.html');
        return res.ok;
    } catch {
        return false;
    }
}

// Start YaCy via cross-spawn directly
async function startYaCy() {
    if (yacyProcess && !yacyProcess.killed) return;
    if (await isYaCyRunning()) return;

    console.log('Starting YaCy via E:\\yacy\\startYACY.bat...');
    yacyProcess = spawn('cmd.exe', ['/c', 'E:\\yacy\\startYACY.bat'], {
        stdio: 'ignore',
        detached: true
    });

    yacyProcess.unref();

    // Wait until YaCy is ready (max 30 seconds)
    let retries = 0;
    while (retries < 30) {
        if (await isYaCyRunning()) break;
        await new Promise(r => setTimeout(r, 1000));
        retries++;
    }

    if (await isYaCyRunning()) {
        console.log('YaCy is running at http://localhost:8090');
    } else {
        console.error('Failed to start YaCy.');
    }
}

// BonziSEARCH web search (YaCy HTML)
app.get('/search', async (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.redirect('/');

    try {
        await startYaCy();

        const yacyURL = `http://localhost:8090/yacysearch.html?query=${encodeURIComponent(query)}&Enter=&auth=&verify=ifexist&contentdom=text&nav=location,hosts,authors,namespace,topics,filetype,protocol,language&startRecord=0&indexof=off&meanCount=5&resource=global&prefermaskfilter=&maximumRecords=10&timezoneOffset=-300`;

        const response = await fetch(yacyURL);
        let html = await response.text();

        // 1️⃣ Replace page title
        html = html.replace(/<title>.*?<\/title>/i, '<title>BonziSEARCH Results</title>');

        // 2️⃣ Remove YaCy menus, nav, and footer
        html = html.replace(/<div id="navbar">[\s\S]*?<\/div>/i, '');
        html = html.replace(/<ul class="nav">[\s\S]*?<\/ul>/i, '');
        html = html.replace(/<div id="footer">[\s\S]*?<\/div>/i, '');

        // 3️⃣ Replace YaCy branding
        html = html.replace(/YaCy Search Engine/gi, 'BonziSEARCH');

        res.send(html);

    } catch (err) {
        res.send(`Error fetching YaCy search page: ${err}`);
    }
});

// Openverse media search
app.get('/media', async (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.redirect('/');

    try {
        const openverseURL = `https://api.openverse.engineering/v1/images?q=${encodeURIComponent(query)}&license_type=commercial&per_page=20`;
        const response = await fetch(openverseURL);
        const data = await response.json();

        const results = data.results ? data.results.map(item => ({
            title: item.title || 'Untitled',
            url: item.url,
            thumbnail: item.thumbnail || item.url
        })) : [];

        let html = `
        <html>
        <head>
            <title>BonziSEARCH Media - "${query}"</title>
            <style>
                body { font-family: 'Comic Sans MS', cursive; text-align: center; background: #f0f0f0; }
                h1 { color: #4B0082; margin-top: 30px; }
                #results { width: 90%; margin: 20px auto; display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; }
                a img { width: 200px; height: auto; border-radius: 10px; border: 2px solid #4B0082; }
            </style>
        </head>
        <body>
            <h1>BonziSEARCH Media Results for "${query}"</h1>
            <div id="results">
        `;

        if (results.length > 0) {
            results.forEach(r => {
                html += `<a href="${r.url}" target="_blank"><img src="${r.thumbnail}" alt="${r.title}"></a>`;
            });
        } else {
            html += 'No media found.';
        }

        html += '</div></body></html>';
        res.send(html);

    } catch (err) {
        res.send(`Error fetching Openverse media: ${err}`);
    }
});

// Serve index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));

// Start server
app.listen(PORT, () => console.log(`BonziSEARCH running at http://localhost:${PORT}`));
