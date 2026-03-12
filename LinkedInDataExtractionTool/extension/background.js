/**
 * Background Service Worker for LinkedIn Candidate Tracker
 * Manifest V3
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('LinkedIn Candidate Tracker installed!');
        
        // Open settings page on first install
        chrome.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
        console.log('LinkedIn Candidate Tracker updated!');
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'candidateProcessed') {
        console.log('Candidate added:', request.candidateName);
    }
    if (request.action === 'candidateExists') {
        console.log('Candidate already processed:', request.candidateName);
    }
    if (request.action === 'processBatchUrls') {
        processBatchUrls(request.urls);
        sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
});

// Batch processing state
let batchProcessing = {
    isProcessing: false,
    urls: [],
    currentIndex: 0,
    completed: 0,
    tabId: null
};

/**
 * Process multiple LinkedIn URLs from uploaded file
 */
async function processBatchUrls(urls) {
    if (batchProcessing.isProcessing) {
        console.log('Batch processing already in progress');
        return;
    }

    batchProcessing = {
        isProcessing: true,
        urls: urls,
        currentIndex: 0,
        completed: 0,
        tabId: null
    };

    console.log(`Starting batch processing of ${urls.length} URLs`);

    // Create or reuse a tab for processing
    await processNextUrl();
}

/**
 * Process the next URL in the batch
 */
async function processNextUrl() {
    if (batchProcessing.currentIndex >= batchProcessing.urls.length) {
        // All URLs processed
        finishBatchProcessing();
        return;
    }

    const url = batchProcessing.urls[batchProcessing.currentIndex];
    console.log(`Processing URL ${batchProcessing.currentIndex + 1}/${batchProcessing.urls.length}: ${url}`);

    try {
        // Create or update tab with the LinkedIn profile URL
        if (batchProcessing.tabId) {
            // Update existing tab
            await chrome.tabs.update(batchProcessing.tabId, { url: url });
        } else {
            // Create new tab
            const tab = await chrome.tabs.create({ url: url, active: false });
            batchProcessing.tabId = tab.id;
        }

        // Wait for page to load and process (give it time to extract data)
        setTimeout(async () => {
            batchProcessing.completed++;
            batchProcessing.currentIndex++;

            // Send progress update to popup
            chrome.runtime.sendMessage({
                action: 'batchProcessingProgress',
                current: batchProcessing.currentIndex,
                total: batchProcessing.urls.length,
                completed: batchProcessing.completed
            });

            // Process next URL after delay
            setTimeout(() => processNextUrl(), 3000);
        }, 10000); // Wait 10 seconds for page to load and data to be extracted

    } catch (error) {
        console.error('Error processing URL:', error);
        batchProcessing.currentIndex++;
        
        // Continue with next URL even if there's an error
        setTimeout(() => processNextUrl(), 3000);
    }
}

/**
 * Finish batch processing and cleanup
 */
async function finishBatchProcessing() {
    console.log(`Batch processing complete. Processed ${batchProcessing.completed}/${batchProcessing.urls.length} URLs`);

    // Close the processing tab
    if (batchProcessing.tabId) {
        try {
            await chrome.tabs.remove(batchProcessing.tabId);
        } catch (error) {
            console.log('Tab already closed');
        }
    }

    // Send final update
    chrome.runtime.sendMessage({
        action: 'batchProcessingProgress',
        current: batchProcessing.urls.length,
        total: batchProcessing.urls.length,
        completed: batchProcessing.completed
    });

    // Reset state
    batchProcessing = {
        isProcessing: false,
        urls: [],
        currentIndex: 0,
        completed: 0,
        tabId: null
    };
}

// Keep service worker alive (optional, for debugging)
chrome.runtime.onStartup.addListener(() => {
    console.log('LinkedIn Candidate Tracker service worker started');
});
