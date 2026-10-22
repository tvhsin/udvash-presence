// Background script for Udvash Discord RPC Extension

// Listen for when extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Udvash Discord RPC extension installed');
        // Open welcome page or show notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Udvash Discord RPC',
            message: 'Extension installed! Visit a class page to start showing your status on Discord.'
        });
    }
});

// Listen for tab updates to detect navigation to class pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && 
        tab.url && 
        tab.url.includes('online.udvash-unmesh.com/Routine/ClassDetails')) {
        
        console.log('Class page detected:', tab.url);
        
        // Inject content script if not already injected
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        }).catch(err => {
            // Script might already be injected, ignore error
            console.log('Content script already injected or failed:', err.message);
        });
    }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'RPC_STATUS':
            console.log('RPC Status:', message.data);
            break;
            
        case 'CLASS_INFO_UPDATED':
            console.log('Class info updated:', message.data);
            break;
            
        case 'RPC_ERROR':
            console.error('RPC Error:', message.data);
            // Show notification about RPC server connection issue
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Discord RPC Connection Issue',
                message: 'Make sure your Discord RPC server is running on localhost:3001'
            });
            break;
    }
});

// Keep service worker alive
chrome.alarms.create('keepAlive', { delayInMinutes: 1, periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        // Simple ping to keep service worker active
        console.log('Service worker keepalive');
    }
});