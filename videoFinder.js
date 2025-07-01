// Function to find video by title and highlight it
function findAndHighlightVideo(title) {
    const videoElements = document.querySelectorAll("div.posts.clearfix > div > a");
    for (const element of videoElements) {
        const videoTitle = element.getAttribute("title");
        // Case-insensitive matching for robustness
        if (videoTitle && videoTitle.toLowerCase().includes(title.toLowerCase())) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.outline = '3px solid #FF5733';
            return true;
        }
    }
    return false;
}

// When the script loads, ask the background script for a job
(async () => {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getHighlightJob' });
        if (response && response.title) {
            console.log('Received highlight job:', response.title);
            findAndHighlightVideo(response.title);
        }
    } catch (error) {
        // This error is expected on pages where there is no highlight job
        if (error.message.includes('The message port closed before a response was received')) {
            // No job for this page, do nothing.
        } else {
            console.error('Error getting highlight job:', error);
        }
    }
})();
