// Popup script for Udvash Discord RPC Extension

let currentTab = null;
let checkInterval = null;

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const serverStatus = document.getElementById('server-status');
const discordStatus = document.getElementById('discord-status');
const pageStatus = document.getElementById('page-status');
const currentSubject = document.getElementById('current-subject');
const currentLesson = document.getElementById('current-lesson');
const currentChapter = document.getElementById('current-chapter');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const refreshBtn = document.getElementById('refresh-btn');
const testBtn = document.getElementById('test-btn');
const stopBtn = document.getElementById('stop-btn');
const startBtn = document.getElementById('start-btn');

// Check RPC server status
async function checkRPCServer() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
        
        const response = await fetch('http://localhost:3001/status', {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            serverStatus.textContent = 'Connected';
            return data;
        } else {
            serverStatus.textContent = 'HTTP Error';
            return false;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            serverStatus.textContent = 'Timeout';
        } else {
            serverStatus.textContent = 'Offline';
        }
        return false;
    }
}

// Check if current page is a class page
function isClassPage(url) {
    return url && url.includes('online.udvash-unmesh.com/Routine/ClassDetails');
}

// Update page status
function updatePageStatus(tab) {
    if (isClassPage(tab.url)) {
        pageStatus.textContent = 'Class Page';
        return true;
    } else {
        pageStatus.textContent = 'Not Class Page';
        return false;
    }
}

// Get class info from content script
async function getClassInfo() {
    if (!currentTab) {
        return null;
    }
    
    try {
        // Only try to inject/execute on class pages
        if (isClassPage(currentTab.url)) {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: () => {
                    if (window.udvashRPC && typeof window.udvashRPC.getInfo === 'function') {
                        return {
                            info: window.udvashRPC.getInfo(),
                            active: window.udvashRPC.isActive()
                        };
                    }
                    return null;
                }
            });
            
            return results[0]?.result || null;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Failed to get class info:', error);
        return null;
    }
}

// Update class info display
function updateClassInfo(info) {
    if (info && info.info) {
        const classData = info.info;
        currentSubject.textContent = classData.details?.fullSubject || classData.className || 'Unknown';
        currentLesson.textContent = classData.details?.lesson || 'None';
        currentChapter.textContent = classData.details?.chapter || classData.subject || 'None';
        
        if (info.active) {
            discordStatus.textContent = 'Active';
            stopBtn.classList.remove('hidden');
            startBtn.classList.add('hidden');
        } else {
            discordStatus.textContent = 'Inactive';
            stopBtn.classList.add('hidden');
            startBtn.classList.remove('hidden');
        }
    } else {
        currentSubject.textContent = 'None';
        currentLesson.textContent = 'None';
        currentChapter.textContent = 'None';
        discordStatus.textContent = 'Not Available';
        stopBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
    }
}

// Update overall status
function updateOverallStatus(serverOk, pageOk, rpcActive) {
    if (serverOk && rpcActive) {
        statusIndicator.classList.add('active');
        errorMessage.classList.add('hidden');
        successMessage.innerHTML = '<strong>Connected:</strong> Discord RPC is active!';
        successMessage.classList.remove('hidden');
    } else {
        statusIndicator.classList.remove('active');
        successMessage.classList.add('hidden');
        
        if (!serverOk) {
            errorMessage.innerHTML = '<strong>Connection Error:</strong> RPC server is offline. Make sure to run: <code>node rpc.js</code>';
            errorMessage.classList.remove('hidden');
        } else if (!rpcActive) {
            errorMessage.innerHTML = '<strong>RPC Inactive:</strong> Visit a class page to start, or use the Start RPC button.';
            errorMessage.classList.remove('hidden');
        } else {
            errorMessage.classList.add('hidden');
        }
    }
}

// Main status check function
async function checkStatus() {
    try {
        // Get current tab
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTab = tabs[0];
        } catch (error) {
            console.error('Failed to get current tab:', error);
            currentTab = null;
        }
        
        // Check server status first
        const serverData = await checkRPCServer();
        const serverOk = !!serverData;
        
        // Check page status
        const pageOk = currentTab ? updatePageStatus(currentTab) : false;
        
        // Update Discord status based on server data
        if (serverData && typeof serverData === 'object') {
            if (serverData.active) {
                discordStatus.textContent = 'Active';
                
                // Update class info from server data if available
                if (serverData.details) {
                    currentSubject.textContent = serverData.details.fullSubject || serverData.currentClass || 'Unknown';
                    currentLesson.textContent = serverData.details.lesson || 'None';
                    currentChapter.textContent = serverData.details.chapter || serverData.currentSubject || 'None';
                } else {
                    currentSubject.textContent = serverData.currentClass || 'Unknown';
                    currentLesson.textContent = 'None';
                    currentChapter.textContent = serverData.currentSubject || 'None';
                }
                
                stopBtn.classList.remove('hidden');
                startBtn.classList.add('hidden');
            } else if (serverData.connected) {
                discordStatus.textContent = 'Connected but Inactive';
                currentSubject.textContent = 'None';
                currentLesson.textContent = 'None';
                currentChapter.textContent = 'None';
                stopBtn.classList.add('hidden');
                startBtn.classList.remove('hidden');
            } else {
                discordStatus.textContent = 'Discord Offline';
                currentSubject.textContent = 'None';
                currentLesson.textContent = 'None';
                currentChapter.textContent = 'None';
                stopBtn.classList.add('hidden');
                startBtn.classList.remove('hidden');
            }
        } else {
            discordStatus.textContent = 'Server Offline';
            
            // Try to get info from content script if on class page
            if (pageOk && currentTab) {
                const classData = await getClassInfo();
                if (classData) {
                    updateClassInfo(classData);
                } else {
                    currentSubject.textContent = 'None';
                    currentLesson.textContent = 'None';
                    currentChapter.textContent = 'None';
                    stopBtn.classList.add('hidden');
                    startBtn.classList.remove('hidden');
                }
            } else {
                currentSubject.textContent = 'None';
                currentLesson.textContent = 'None';
                currentChapter.textContent = 'None';
                stopBtn.classList.add('hidden');
                startBtn.classList.remove('hidden');
            }
        }
        
        // Update overall status
        updateOverallStatus(serverOk, pageOk, serverData?.active || false);
        
    } catch (error) {
        console.error('Status check failed:', error);
        serverStatus.textContent = 'Error';
        discordStatus.textContent = 'Error';
        pageStatus.textContent = currentTab ? 'Error' : 'No Tab Access';
        statusIndicator.classList.remove('active');
        
        // Show error message
        errorMessage.innerHTML = '<strong>Extension Error:</strong> Failed to check status. Try refreshing the popup.';
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
    }
}

// Test RPC connection
async function testRPC() {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch('http://localhost:3001/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                className: 'Extension Test',
                subject: 'Connection Test',
                details: {
                    fullSubject: 'Extension Test',
                    lesson: 'Connection Check',
                    chapter: 'Testing Communication'
                }
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            successMessage.innerHTML = '<strong>Success:</strong> Test heartbeat sent to RPC server! Check your Discord.';
            successMessage.classList.remove('hidden');
            errorMessage.classList.add('hidden');
            
            // Refresh status after a moment
            setTimeout(checkStatus, 1000);
            
            setTimeout(() => {
                successMessage.classList.add('hidden');
            }, 4000);
        } else {
            throw new Error(`Server responded with ${response.status}`);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            errorMessage.innerHTML = '<strong>Test Failed:</strong> Connection timeout. Make sure your RPC server is running on localhost:3001';
        } else {
            errorMessage.innerHTML = '<strong>Test Failed:</strong> Could not connect to RPC server. Run: <code>node rpc.js</code>';
        }
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
    }
    
    testBtn.disabled = false;
    testBtn.textContent = 'Test RPC';
}

// Stop RPC manually
async function stopRPC() {
    if (!currentTab || !isClassPage(currentTab.url)) {
        errorMessage.innerHTML = '<strong>Error:</strong> You need to be on a class page to stop RPC';
        errorMessage.classList.remove('hidden');
        return;
    }
    
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                if (window.udvashRPC && typeof window.udvashRPC.stop === 'function') {
                    window.udvashRPC.stop();
                    return true;
                }
                return false;
            }
        });
        
        successMessage.innerHTML = '<strong>Success:</strong> Discord RPC stopped';
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        
        setTimeout(() => {
            successMessage.classList.add('hidden');
            checkStatus(); // Refresh status
        }, 2000);
        
    } catch (error) {
        errorMessage.innerHTML = '<strong>Error:</strong> Failed to stop RPC';
        errorMessage.classList.remove('hidden');
    }
    
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop RPC';
}

// Start RPC manually
async function startRPC() {
    if (!currentTab || !isClassPage(currentTab.url)) {
        errorMessage.innerHTML = '<strong>Error:</strong> You need to be on a class page to start RPC';
        errorMessage.classList.remove('hidden');
        return;
    }
    
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                if (window.udvashRPC && typeof window.udvashRPC.start === 'function') {
                    window.udvashRPC.start();
                    return true;
                }
                return false;
            }
        });
        
        successMessage.innerHTML = '<strong>Success:</strong> Discord RPC started';
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        
        setTimeout(() => {
            successMessage.classList.add('hidden');
            checkStatus(); // Refresh status
        }, 2000);
        
    } catch (error) {
        errorMessage.innerHTML = '<strong>Error:</strong> Failed to start RPC';
        errorMessage.classList.remove('hidden');
    }
    
    startBtn.disabled = false;
    startBtn.textContent = 'Start RPC';
}

// Refresh status
async function refresh() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    await checkStatus();
    
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
}

// Initialize popup
async function init() {
    // Initial status check
    await checkStatus();
    
    // Start periodic status checking
    checkInterval = setInterval(checkStatus, 3000); // Check every 3 seconds
    
    // Event listeners
    refreshBtn.addEventListener('click', refresh);
    testBtn.addEventListener('click', testRPC);
    stopBtn.addEventListener('click', stopRPC);
    startBtn.addEventListener('click', startRPC);
}

// Cleanup when popup closes
window.addEventListener('beforeunload', () => {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
});

// Start when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}