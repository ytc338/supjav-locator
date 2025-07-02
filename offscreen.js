chrome.runtime.onMessage.addListener(async (request) => {
    if (request.action !== 'checkPage') return;

    const { videoTitle, pageNum } = request;
    const url = `https://supjav.com/category/uncensored-jav/page/${pageNum}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            chrome.runtime.sendMessage({ found: false, totalVideos: null });
            return;
        }

        const pageHtml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(pageHtml, 'text/html');

        // Get total video count from H1 tag
        let totalVideos = null;
        const h1 = doc.querySelector('body > div.main > div > div.content > div.archive-title > h1');
        if (h1) {
            const match = h1.textContent.match(/\((\d+)\)/);
            if (match && match[1]) {
                totalVideos = parseInt(match[1], 10);
            }
        }

        // Check if the video is on the current page
        let found = false;
        const videoElements = doc.querySelectorAll("div.posts.clearfix > div > a");
        for (const element of videoElements) {
            if (element.getAttribute("title")?.includes(videoTitle)) {
                found = true;
                break;
            }
        }

        chrome.runtime.sendMessage({ found, totalVideos });

    } catch (error) {
        console.error('Offscreen document error:', error);
        chrome.runtime.sendMessage({ found: false, totalVideos: null });
    }
});