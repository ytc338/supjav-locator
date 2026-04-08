const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
const VIDEOS_PER_PAGE = 24;
let highlightTasks = {};

// --- Helper Functions ---

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
            // Ensure we only handle the response for this specific request
            if (message.totalVideos !== undefined) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
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
        highlightTasks[tab.id] = videoTitle;
    });
}

// --- Main Logic ---

chrome.action.onClicked.addListener(async () => {
    // Primary: use synced data (works across devices)
    const storedData = await chrome.storage.sync.get(['oldVideoCount', 'videoTitle', 'lastKnownPage']);
    let videoTitle = storedData.videoTitle;
    let lastKnownPage = storedData.lastKnownPage;

    // Fallback: bootstrap from local history on first run
    if (!videoTitle) {
        videoTitle = await getVideoTitleFromHistory('supjav.com fc2');
    }
    if (!lastKnownPage) {
        const historyResults = await new Promise(resolve => chrome.history.search({ text: 'supjav.com', maxResults: 50, startTime: 480 }, resolve));
        const lastVisited = historyResults.find((entry) => entry.url.includes('/page/'));
        lastKnownPage = lastVisited ? parseInt(lastVisited.url.match(/page\/(\d+)/)[1], 10) : 1;
    }

    if (!videoTitle) return;

    const initialCheck = await findVideoViaOffscreen(videoTitle, lastKnownPage);

    if (initialCheck.found) {
        const url = `https://supjav.com/category/uncensored-jav/page/${lastKnownPage}`;
        openTabAndPrepareHighlight(url, videoTitle);
        if (initialCheck.totalVideos) {
            chrome.storage.sync.set({ oldVideoCount: initialCheck.totalVideos, videoTitle, lastKnownPage });
        }
        await chrome.offscreen.closeDocument();
        return;
    }

    const newVideoCount = initialCheck.totalVideos;
    if (!newVideoCount) {
        const url = `https://supjav.com/category/uncensored-jav/page/${lastKnownPage}`;
        openTabAndPrepareHighlight(url, videoTitle);
        await chrome.offscreen.closeDocument();
        return;
    }

    const oldVideoCount = storedData.oldVideoCount || newVideoCount;

    const videosAdded = newVideoCount - oldVideoCount;
    const pagesShifted = Math.floor(videosAdded / VIDEOS_PER_PAGE);
    const predictedPage = lastKnownPage + pagesShifted;

    console.log(`Videos added: ${videosAdded}. Pages shifted: ${pagesShifted}. Predicted page: ${predictedPage}`);

    const predictedCheck = await findVideoViaOffscreen(videoTitle, predictedPage);
    if (predictedCheck.found) {
        const finalUrl = `https://supjav.com/category/uncensored-jav/page/${predictedPage}`;
        openTabAndPrepareHighlight(finalUrl, videoTitle);
        chrome.storage.sync.set({ oldVideoCount: newVideoCount, videoTitle, lastKnownPage: predictedPage });
    } else {
        console.log("Not on predicted page, checking next page.");
        const nextPage = predictedPage + 1;
        const nextCheck = await findVideoViaOffscreen(videoTitle, nextPage);
        if (nextCheck.found) {
            const finalUrl = `https://supjav.com/category/uncensored-jav/page/${nextPage}`;
            openTabAndPrepareHighlight(finalUrl, videoTitle);
            chrome.storage.sync.set({ oldVideoCount: newVideoCount, videoTitle, lastKnownPage: nextPage });
        } else {
            const fallbackUrl = `https://supjav.com/category/uncensored-jav/page/${lastKnownPage}`;
            openTabAndPrepareHighlight(fallbackUrl, videoTitle);
        }
    }

    await chrome.offscreen.closeDocument();
});

// --- Message Listener for Highlight Job ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getHighlightJob') {
        const tabId = sender.tab.id;
        if (highlightTasks[tabId]) {
            sendResponse({ title: highlightTasks[tabId] });
            delete highlightTasks[tabId];
        }
        return true;
    }
});