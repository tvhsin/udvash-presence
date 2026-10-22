let heartbeatInterval = null;
let lastClassInfo = null;
let rpcActive = false;

// Function to extract class information
function extractClassInfo() {
    try {
        // Get the main title
        const titleElement = document.querySelector('.card-title');
        if (!titleElement) {
            console.log('No class title found');
            return null;
        }

        const fullTitle = titleElement.textContent.trim();
        
        // Extract subject name from title
        const titleParts = fullTitle.replace('Regular Class ', '').split(' ');
        
        // Find lesson number
        const lessonMatch = fullTitle.match(/Lecture-(\d+)/);
        const lessonNumber = lessonMatch ? `Lesson ${lessonMatch[1]}` : null;
        
        // Extract subject name (everything before "Lecture-X")
        const subjectName = fullTitle.replace(/\s*Lecture-\d+/, '').replace('Regular Class ', '');
        
        // Extract chapter info
        const chapterElement = document.querySelector('.card-body div strong');
        const chapterText = chapterElement ? chapterElement.textContent.trim() : '';
        const chapterMatch = chapterText.match(/Chapter-(\d+)\s+(.+)/);
        const chapterDisplay = chapterMatch ? `Ch.${chapterMatch[1]}: ${chapterMatch[2]}` : chapterText;
        
        // Extract detailed info from description
        const descriptionDiv = document.querySelector('.card-body div:nth-child(2)');
        const description = descriptionDiv ? descriptionDiv.textContent.trim() : '';
        
        // Look for subject code pattern (HM-13, ICT-10, etc.)
        const codeMatch = description.match(/([A-Z]+)-(\d+)/);
        const subjectCode = codeMatch ? `${codeMatch[1]}-${codeMatch[2]}` : null;
        
        // Better topic extraction - look for content after colons or semicolons
        let topicsList = [];
        if (description) {
            // Split by colons or semicolons to find topic sections
            const sections = description.split(/[;:]/);
            
            if (sections.length > 1) {
                // Take everything after the first colon/semicolon as topics
                const topicsSection = sections.slice(1).join(';').trim();
                
                if (topicsSection) {
                    // Split topics more intelligently
                    // Look for common separators but preserve decimal numbers
                    let topics = topicsSection
                        .split(/,(?!\s*\d)/) // Split on commas not followed by digits
                        .map(topic => topic.trim())
                        .filter(topic => topic.length > 2); // Filter out very short fragments
                    
                    // If no good comma splits, try other separators
                    if (topics.length === 1) {
                        topics = topicsSection
                            .split(/[।\|]/) // Try Bangla danda or pipe separators
                            .map(topic => topic.trim())
                            .filter(topic => topic.length > 2);
                    }
                    
                    // If still one long topic, try to split on specific phrases
                    if (topics.length === 1 && topicsSection.length > 50) {
                        topics = topicsSection
                            .split(/(?:and|এবং|ও)/i) // Split on "and" in English or Bengali
                            .map(topic => topic.trim())
                            .filter(topic => topic.length > 2);
                    }
                    
                    topicsList = topics.slice(0, 5); // Limit to first 5 topics
                }
            }
        }

        console.log("Extracted class info:", {
            subject: subjectName,
            lesson: lessonNumber,
            chapter: chapterDisplay,
            code: subjectCode,
            topics: topicsList
        });

        return {
            className: `${subjectName}${lessonNumber ? ` - ${lessonNumber}` : ''}`,
            subject: chapterDisplay || subjectName,
            details: {
                fullSubject: subjectName,
                lesson: lessonNumber,
                chapter: chapterDisplay,
                code: subjectCode,
                topics: topicsList,
                description: description
            }
        };
    } catch (error) {
        console.error('Error extracting class info:', error);
        return null;
    }
}

// Function to send heartbeat to RPC server
async function sendHeartbeat(classInfo) {
    try {
        const response = await fetch('http://localhost:3001/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(classInfo)
        });

        if (response.ok) {
            console.log('Heartbeat sent successfully:', classInfo.className);
            return true;
        } else {
            console.error('Heartbeat failed:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Failed to send heartbeat:', error);
        return false;
    }
}

// Function to start RPC monitoring
function startRPC() {
    if (rpcActive) return;
    
    const classInfo = extractClassInfo();
    if (!classInfo) {
        console.log('No class info found, retrying in 5 seconds...');
        setTimeout(startRPC, 5000);
        return;
    }

    console.log('Starting Discord RPC for:', classInfo);
    rpcActive = true;
    lastClassInfo = classInfo;

    // Send initial heartbeat
    sendHeartbeat(classInfo);

    // Start heartbeat interval - continue even when not on page
    heartbeatInterval = setInterval(async () => {
        let currentInfo = null;
        
        // Only extract new info if we're still on a class page
        if (isClassDetailsPage()) {
            currentInfo = extractClassInfo();
            
            if (currentInfo) {
                // Check if class info has changed
                if (JSON.stringify(currentInfo) !== JSON.stringify(lastClassInfo)) {
                    console.log('Class info updated:', currentInfo);
                    lastClassInfo = currentInfo;
                }
            }
        }
        
        // Use current info if available, otherwise use last known info
        const infoToSend = currentInfo || lastClassInfo;
        
        if (infoToSend) {
            await sendHeartbeat(infoToSend);
        } else {
            console.log('No class info available, stopping RPC');
            stopRPC();
        }
    }, 15000); // Send heartbeat every 15 seconds

    // Show notification
    showNotification('Discord RPC Started', `Now showing: ${classInfo.className} (will stay active)`);
}

// Function to stop RPC monitoring
function stopRPC() {
    if (!rpcActive) return;
    
    console.log('Stopping Discord RPC');
    rpcActive = false;
    
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    // Send stop request to server
    fetch('http://localhost:3001/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error('Failed to send stop request:', err));
    
    lastClassInfo = null;
    showNotification('Discord RPC Stopped', 'Your status is no longer showing on Discord');
}

// Function to show notification
function showNotification(title, message) {
    // Create a simple toast notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #7289da;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
        <div>${message}</div>
    `;
    
    // Add animation keyframes
    if (!document.querySelector('#rpc-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'rpc-notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Function to check if we're on the correct page
function isClassDetailsPage() {
    return window.location.pathname.includes('/Routine/ClassDetails') && 
           document.querySelector('.card-title');
}

// Initialize when page loads
function initialize() {
    if (isClassDetailsPage()) {
        console.log('Udvash class page detected, starting Discord RPC...');
        // Wait a bit for the page to fully load
        setTimeout(startRPC, 2000);
    }
}

// Handle page navigation (for SPAs)
let currentUrl = window.location.href;
function handleNavigation() {
    if (currentUrl !== window.location.href) {
        currentUrl = window.location.href;
        
        if (isClassDetailsPage()) {
            console.log('Navigated to class page, updating RPC...');
            setTimeout(startRPC, 2000);
        } else {
            console.log('Left class page, but keeping RPC active with last known info');
            // Don't stop RPC, just continue with last known class info
            if (rpcActive && lastClassInfo) {
                // Send heartbeat with last known info to keep it alive
                sendHeartbeat(lastClassInfo);
            }
        }
    }
}

// Listen for navigation changes
const observer = new MutationObserver(handleNavigation);
observer.observe(document.body, { childList: true, subtree: true });

// Handle page unload - only stop if explicitly closing browser/tab
window.addEventListener('beforeunload', () => {
    // Only stop RPC on actual page unload (closing tab/browser)
    // Comment out the next line if you want RPC to persist even after closing browser
    // stopRPC();
    console.log('Page unloading, but keeping RPC active');
});

// Handle visibility changes - don't stop RPC when tab becomes hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden, but keeping RPC active');
        // Don't stop RPC when tab is hidden
        if (rpcActive && lastClassInfo) {
            // Send one more heartbeat to keep it alive
            sendHeartbeat(lastClassInfo);
        }
    } else if (isClassDetailsPage()) {
        console.log('Page visible again, updating RPC if needed');
        setTimeout(() => {
            if (!rpcActive) {
                startRPC();
            }
        }, 1000);
    }
});

// Initialize
initialize();

// Expose functions for debugging
window.udvashRPC = {
    start: startRPC,
    stop: stopRPC,
    getInfo: extractClassInfo,
    isActive: () => rpcActive
};