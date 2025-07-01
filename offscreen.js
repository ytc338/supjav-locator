chrome.runtime.onMessage.addListener(async (request) => {
    if (request.action === 'checkPage') {
        const { videoTitle, pageNum } = request;
        const url = `https://supjav.com/category/uncensored-jav/page/${pageNum}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                chrome.runtime.sendMessage({ found: false });
                return;
            }

            const pageHtml = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(pageHtml, 'text/html');

            const videoElements = doc.querySelectorAll("div.posts.clearfix > div > a");
            let found = false;
            for (const element of videoElements) {
                const title = element.getAttribute("title");
                if (title && title.includes(videoTitle)) {
                    found = true;
                    break;
                }
            }
            chrome.runtime.sendMessage({ found });

        } catch (error) {
            console.error('Offscreen document error:', error);
            chrome.runtime.sendMessage({ found: false });
        }
    }
});
