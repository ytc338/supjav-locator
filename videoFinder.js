const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const LIST_PAGE_RE = /supjav\.com\/category\/uncensored-jav\/page\/(\d+)/;
const WATCH_SECONDS = 10; // page must be visible this long to count as "watched"

// Find video by title and highlight it
function findAndHighlightVideo(title) {
    const needle = normalize(title);
    for (const element of document.querySelectorAll('div.posts.clearfix > div > a')) {
        if (normalize(element.getAttribute('title')).includes(needle)) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.outline = '3px solid #FF5733';
            return true;
        }
    }
    return false;
}

function readTotalVideos() {
    const h1 = document.querySelector('.archive-title h1') || document.querySelector('h1');
    const c = h1 && h1.textContent.match(/\((\d[\d,]*)\)/);
    return c ? parseInt(c[1].replace(/,/g, ''), 10) : null;
}

// List page: remember this page's total count locally (NOT as the resume point).
// It's only promoted to the resume point when you watch a video from this page.
(async () => {
    const m = location.href.match(LIST_PAGE_RE);
    if (!m) return;
    const total = readTotalVideos();
    if (!total) return;
    const { listSnaps = {} } = await chrome.storage.local.get('listSnaps');
    listSnaps[m[1]] = total;
    const keys = Object.keys(listSnaps);
    if (keys.length > 50) delete listSnaps[keys[0]];
    await chrome.storage.local.set({ listSnaps });
})();

// Video page: once it has been visible for WATCH_SECONDS, save it as the last
// watched video together with the list page it was opened from (the referrer).
(() => {
    const t = document.title.match(/FC2[-\s]?PPV[-\s]?(\d+)/i);
    if (!t) return;
    const ref = document.referrer.match(LIST_PAGE_RE);
    if (!ref) {
        console.log('[Locator] Video not opened from an uncensored-jav list page; not tracking.');
        return;
    }
    const videoTitle = `FC2PPV ${t[1]}`;
    const page = parseInt(ref[1], 10);

    let visibleMs = 0;
    let last = Date.now();
    const timer = setInterval(async () => {
        const now = Date.now();
        if (document.visibilityState === 'visible') visibleMs += now - last;
        last = now;
        if (visibleMs < WATCH_SECONDS * 1000) return;
        clearInterval(timer);

        const { listSnaps = {} } = await chrome.storage.local.get('listSnaps');
        const data = { videoTitle, lastKnownPage: page };
        if (listSnaps[page]) data.oldVideoCount = listSnaps[page];
        await chrome.storage.sync.set(data);
        if (!listSnaps[page]) await chrome.storage.sync.remove('oldVideoCount');
        console.log('[Locator] Saved last watched:', data);
    }, 1000);
})();

function showBanner(text) {
    let el = document.getElementById('supjav-locator-banner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'supjav-locator-banner';
        el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
            'background:#222;color:#fff;padding:8px 14px;border-radius:6px;font:14px sans-serif;' +
            'box-shadow:0 2px 8px rgba(0,0,0,.4)';
        document.body.appendChild(el);
    }
    el.textContent = text;
}

// Search tab: check this list page for the video, or move on to the next page.
(async () => {
    const m = location.href.match(LIST_PAGE_RE);
    if (!m) return;
    // No video grid = Cloudflare check page. Wait; the real page will load next.
    if (!document.querySelector('div.posts.clearfix > div > a')) return;

    try {
        const job = await chrome.runtime.sendMessage({ action: 'getSearchJob' });
        if (!job || !job.title) return;

        const page = parseInt(m[1], 10);
        const found = findAndHighlightVideo(job.title);
        const step = await chrome.runtime.sendMessage({
            action: 'searchStep', page, total: readTotalVideos(), found,
        });

        if (step.done) {
            showBanner(`Found ${job.title} on page ${page}`);
            setTimeout(() => document.getElementById('supjav-locator-banner')?.remove(), 4000);
        } else if (step.nextPage) {
            showBanner(`${job.title} not on page ${page}, trying page ${step.nextPage}…`);
            location.replace(`https://supjav.com/category/uncensored-jav/page/${step.nextPage}`);
        } else if (step.notFound) {
            showBanner(`Couldn't find ${job.title} near page ${step.predicted}`);
        }
    } catch (error) {
        console.error('[Locator] search step failed:', error);
    }
})();
