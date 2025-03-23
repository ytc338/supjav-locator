// Listen for messages from background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'findVideo' && request.title) {
        const videoTitle = request.title; // Title to search for
        const foundVideo = findVideoByTitle(videoTitle);

        if (foundVideo) {
            // Scroll the video into view and highlight it
            foundVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            foundVideo.style.outline = '2px solid red';
            sendResponse({ found: true });
        } else {
            sendResponse({ found: false });
        }
    }
    return true; // Keep the message channel open for async response
});

// Function to find video by title
function findVideoByTitle(title) {
    const videoElements = document.querySelectorAll("div.posts.clearfix > div > a");
    for (const element of videoElements) {
        const videoTitle = element.getAttribute("title");
        if (videoTitle && videoTitle.includes(title)) {
            return element;
        }
    }
    return null; // Not found
}