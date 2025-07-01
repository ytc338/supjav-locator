const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
let highlightTasks = {}; // Store highlight jobs here, keyed by tabId

async function hasOffscreenDocument() {
    const matchedClients = await clients.matchAll();
    for (const client of matchedClients) {
        if (client.url.endsWith(OFFSCREEN_DOCUMENT_PATH)) {
            return true;
        }
    }
    return false;
}

async function findVideoViaOffscreen(videoTitle, pageNum) {
    if (!(await hasOffscreenDocument())) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['DOM_PARSER'],
            justification: 'To parse HTML content from a fetch request.',
        });
    }

    return new Promise((resolve) => {
        const listener = (message) => {
            if (typeof message.found === 'boolean') {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message.found);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        chrome.runtime.sendMessage({ action: 'checkPage', videoTitle, pageNum });
    });
}

async function getVideoTitleFromHistory(query) {
    return new Promise((resolve) => {
        chrome.history.search({ text: query, maxResults: 10, startTime: 480 }, (results) => {
            if (results.length > 0) {
                const firstResultTitle = results[0].title || '';
                const videoTitle = firstResultTitle.split(' ').slice(0, 2).join(' ');
                resolve(videoTitle);
            } else {
                resolve(null);
            }
        });
    });
}

function openTabAndPrepareHighlight(url, videoTitle) {
    chrome.tabs.create({ url: url }, (tab) => {
        // Store the title for the content script to retrieve
        highlightTasks[tab.id] = videoTitle;
    });
}

// Listen for the content script asking for its job
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getHighlightJob') {
        const tabId = sender.tab.id;
        if (highlightTasks[tabId]) {
            sendResponse({ title: highlightTasks[tabId] });
            // Clean up the task after sending it
            delete highlightTasks[tabId];
        }
        return true; // Keep channel open for async response
    }
});

chrome.action.onClicked.addListener(async () => {
    const videoTitle = await getVideoTitleFromHistory('supjav.com fc2');
    if (!videoTitle) {
        return;
    }

    chrome.history.search({ text: 'supjav.com', maxResults: 50 }, async (results) => {
        const lastVisited = results.find((entry) => entry.url.includes('/page/'));
        let startPage = 1;
        if (lastVisited) {
            const pageMatch = lastVisited.url.match(/page\/(\d+)/);
            startPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;
        }

        const MAX_PAGES_TO_CHECK = 10;
        for (let i = 0; i < MAX_PAGES_TO_CHECK; i++) {
            const currentPage = startPage + i;
            const found = await findVideoViaOffscreen(videoTitle, currentPage);
            if (found) {
                const finalUrl = `https://supjav.com/category/uncensored-jav/page/${currentPage}`;
                openTabAndPrepareHighlight(finalUrl, videoTitle);
                chrome.offscreen.closeDocument();
                return;
            }
        }

        const fallbackUrl = `https://supjav.com/category/uncensored-jav/page/${startPage}`;
        openTabAndPrepareHighlight(fallbackUrl, videoTitle);
        chrome.offscreen.closeDocument();
    });
});