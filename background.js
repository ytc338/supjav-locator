// Supjav blocks background fetches with Cloudflare (HTTP 403), so the search
// runs in a visible tab instead: the tab opens a list page, the content script
// reports whether the video is there, and we tell it which page to try next.

const VIDEOS_PER_PAGE = 24;
const LIST_URL = 'https://supjav.com/category/uncensored-jav/page/';
const LIST_PAGE_RE = /supjav\.com\/category\/uncensored-jav\/page\/(\d+)/;
const MAX_PROBES = 13;               // predicted page ± 6
const JOB_TTL_MS = 5 * 60 * 1000;    // a search tab gives up after 5 minutes

// --- Helpers ---

function setBadge(text, title) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: text === '!' ? '#D93025' : '#888' });
    chrome.action.setTitle({ title: title || 'Find Last Video' });
}

// Search jobs live in storage.session so they survive the service worker going
// idle (e.g. while you sit on a Cloudflare check page).
async function getJobs() {
    const { searchJobs = {} } = await chrome.storage.session.get('searchJobs');
    const now = Date.now();
    for (const id of Object.keys(searchJobs)) {
        if (searchJobs[id].expires < now) delete searchJobs[id];
    }
    return searchJobs;
}

const saveJobs = (searchJobs) => chrome.storage.session.set({ searchJobs });

// Predicted page first, then alternate forward/backward. Videos can move either
// way (new uploads push them to higher pages, removals pull them lower).
function candidatePages(predicted) {
    const pages = [];
    for (let d = 0; pages.length < MAX_PROBES; d++) {
        for (const p of d === 0 ? [predicted] : [predicted + d, predicted - d]) {
            if (p >= 1 && !pages.includes(p) && pages.length < MAX_PROBES) pages.push(p);
        }
    }
    return pages;
}

async function getVideoTitleFromHistory(query) {
    const results = await chrome.history.search({ text: query, maxResults: 10, startTime: 0 });
    const m = results.map((r) => (r.title || '').match(/FC2[-\s]?PPV[-\s]?(\d+)/i)).find(Boolean);
    return m ? `FC2PPV ${m[1]}` : null;
}

// --- Icon click: start a search in a new tab ---

chrome.action.onClicked.addListener(async () => {
    const stored = await chrome.storage.sync.get(['oldVideoCount', 'videoTitle', 'lastKnownPage']);
    let videoTitle = stored.videoTitle;
    let lastKnownPage = stored.lastKnownPage;

    // First run: bootstrap from local history
    if (!videoTitle) videoTitle = await getVideoTitleFromHistory('supjav.com fc2');
    if (!lastKnownPage) {
        const history = await chrome.history.search({ text: 'supjav.com', maxResults: 50, startTime: 0 });
        const hit = history.find((e) => LIST_PAGE_RE.test(e.url));
        lastKnownPage = hit ? parseInt(hit.url.match(LIST_PAGE_RE)[1], 10) : 1;
    }

    if (!videoTitle) return setBadge('?', 'No watched video saved yet');
    setBadge('…', `Searching for ${videoTitle}`);

    // Register the job before the page loads, so the content script always finds it.
    const tab = await chrome.tabs.create({});
    const jobs = await getJobs();
    jobs[tab.id] = {
        title: videoTitle,
        lastKnownPage,
        oldVideoCount: stored.oldVideoCount || null,
        queue: null,
        visited: [],
        expires: Date.now() + JOB_TTL_MS,
    };
    await saveJobs(jobs);
    chrome.tabs.update(tab.id, { url: LIST_URL + lastKnownPage });
});

// --- Messages from the content script ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) return;

    if (request.action === 'getSearchJob') {
        getJobs().then((jobs) => sendResponse({ title: jobs[tabId]?.title || null }));
        return true;
    }

    if (request.action === 'searchStep') {
        handleSearchStep(tabId, request).then(sendResponse);
        return true;
    }
});

async function handleSearchStep(tabId, { page, total, found }) {
    const jobs = await getJobs();
    const job = jobs[tabId];
    if (!job) return {};

    if (found) {
        delete jobs[tabId];
        await saveJobs(jobs);
        await chrome.storage.sync.set({
            videoTitle: job.title,
            lastKnownPage: page,
            oldVideoCount: total || job.oldVideoCount,
        });
        setBadge('', '');
        return { done: true };
    }

    if (!job.visited.includes(page)) job.visited.push(page);

    // On the first page we see, use its live total to predict the shift.
    if (!job.queue) {
        let predicted = job.lastKnownPage;
        if (total && job.oldVideoCount) {
            const added = total - job.oldVideoCount;
            predicted = Math.max(1, job.lastKnownPage + Math.floor(added / VIDEOS_PER_PAGE));
            console.log(`Videos added since snapshot: ${added}. Predicted page: ${predicted}`);
        }
        job.predicted = predicted;
        job.queue = candidatePages(predicted);
    }

    const next = job.queue.find((p) => !job.visited.includes(p));
    if (next) {
        job.expires = Date.now() + JOB_TTL_MS;
        await saveJobs(jobs);
        setBadge('…', `Searching for ${job.title}: trying page ${next}`);
        return { nextPage: next };
    }

    delete jobs[tabId];
    await saveJobs(jobs);
    setBadge('?', `${job.title} not found within 6 pages of ${job.predicted}`);
    return { notFound: true, predicted: job.predicted };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const jobs = await getJobs();
    if (jobs[tabId]) {
        delete jobs[tabId];
        await saveJobs(jobs);
        setBadge('', '');
    }
});

// The last-watched video and its list page are recorded by videoFinder.js
// on video pages (only after you've actually watched for a few seconds).
