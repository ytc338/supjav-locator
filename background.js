async function getVideoTitleFromHistory(query) {
    return new Promise((resolve) => {
        chrome.history.search({ text: query, maxResults: 10, startTime:480 }, (results) => {
            console.log("History search results:", results); // Log the results to debug
            if (results.length > 0) {
                const firstResultTitle = results[0].title || '';
                const videoTitle = firstResultTitle.split(' ').slice(0, 2).join(' '); // First two words
                console.log("Extracted video title:", videoTitle); // Debug extracted title
                resolve(videoTitle);
            } else {
                return;
            }
        });
    });
}

// Navigate to a page and check if the video is present
function navigateToPage(tabId, pageNum, videoTitle) {
    const nextUrl = `https://supjav.com/category/uncensored-jav/page/${pageNum}`;

    // Navigate to the next URL
    chrome.tabs.update(tabId, { url: nextUrl }, () => {
        console.log(`Navigated to: ${nextUrl}`);

        // Listen for the page to finish loading
        const onCompletedListener = (details) => {
            if (details.tabId === tabId && details.frameId === 0) {
                // Remove the listener to prevent duplicate responses
                chrome.webNavigation.onCompleted.removeListener(onCompletedListener);

                // Send a message to the content script to search for the video
                chrome.tabs.sendMessage(tabId, { action: 'findVideo', title: videoTitle }, (response) => {
                    if (response && !response.found) {
                        // If the video is not found, navigate to the next page
                        navigateToPage(tabId, pageNum + 1, videoTitle);
                    } else if (response && response.found) {
                        console.log('Video found!');
                        return; // Stop navigation
                    }
                });
            }
        };

        // Add the listener for when the page finishes loading
        chrome.webNavigation.onCompleted.addListener(onCompletedListener);
    });
}

// Start the navigation process
function startNavigation(videoTitle) {
    chrome.history.search({ text: 'supjav.com', maxResults: 50, startTime:480 }, (results) => {
        const lastVisited = results.find((entry) => entry.url.includes('/page/'));
        if (lastVisited) {
            const pageMatch = lastVisited.url.match(/page\/(\d+)/);
            const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
            chrome.tabs.create({ url: lastVisited.url }, (tab) => {
                navigateToPage(tab.id, pageNum, videoTitle);
            });
        } else {
            return;
        }
    });
}

// When the extension is clicked
chrome.action.onClicked.addListener(async () => {
    const videoTitle = await getVideoTitleFromHistory('supjav.com fc2');
    if (videoTitle) {
        startNavigation(videoTitle);
    } else {
        return;
    }
});