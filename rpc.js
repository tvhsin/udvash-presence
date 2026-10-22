const RPC = require("discord-rpc");
const express = require("express");

// Configuration
const CONFIG = {
    clientId: "1396418113058373642",
    port: 3001,
    heartbeatTimeout: 60000, // 60 seconds
    monitorInterval: 15000,  // 15 seconds
    maxReconnectAttempts: 5
};

// Initialize Express app
const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Application state
class RPCState {
    constructor() {
        this.rpc = null;
        this.isConnected = false;
        this.isActive = false;
        this.reconnectAttempts = 0;
        this.startTime = new Date();
        this.lastHeartbeat = new Date();
        this.currentClass = "Udvash Online";
        this.currentSubject = "General";
        this.classDetails = null;
        this.monitoringInterval = null;
        this.reconnectTimeout = null;
    }

    reset() {
        this.currentClass = "Udvash Online";
        this.currentSubject = "General";
        this.classDetails = null;
        this.isActive = false;
    }

    updateClassInfo(data) {
        if (data.className) {
            this.currentClass = data.className.trim();
        }
        if (data.subject) {
            this.currentSubject = data.subject.trim();
        }
        if (data.details) {
            this.classDetails = data.details;
        }
        this.lastHeartbeat = new Date();
    }
}

const state = new RPCState();

// Discord RPC Management
class DiscordRPC {
    static createClient() {
        try {
            if (state.rpc) {
                try {
                    state.rpc.destroy();
                } catch (e) {
                    console.log('Cleaned up previous RPC client');
                }
                state.rpc = null;
            }

            RPC.register(CONFIG.clientId);
            state.rpc = new RPC.Client({ transport: "ipc" });

            state.rpc.on("ready", () => {
                state.isConnected = true;
                state.reconnectAttempts = 0;
                console.log("✅ Discord RPC connected successfully");
                
                if (new Date() - state.lastHeartbeat < CONFIG.heartbeatTimeout) {
                    this.activate();
                }
            });

            state.rpc.on("disconnected", () => {
                console.log("❌ Discord RPC disconnected");
                state.isConnected = false;
                state.isActive = false;
                this.attemptReconnection();
            });

            state.rpc.on("error", (error) => {
                console.error("RPC Error:", error.message);
                state.isConnected = false;
                state.isActive = false;
            });

            return state.rpc;
        } catch (error) {
            console.error("Failed to create RPC client:", error.message);
            return null;
        }
    }

    static async connect() {
        if (!state.rpc) {
            this.createClient();
        }

        if (state.rpc && !state.isConnected) {
            try {
                await state.rpc.login({ clientId: CONFIG.clientId });
                return true;
            } catch (error) {
                console.error(`Connection attempt failed:`, error.message);
                state.isConnected = false;
                throw error;
            }
        }
        return state.isConnected;
    }

    static activate() {
        if (!state.isConnected || state.isActive) return;
        
        state.isActive = true;
        this.updateActivity();
        console.log("🎯 Discord RPC activated");
    }

    static deactivate() {
        if (!state.isActive) return;
        
        state.isActive = false;
        this.clearActivity();
        state.reset();
        console.log("🔇 Discord RPC deactivated");
    }

    static updateActivity() {
        if (!state.rpc || !state.isConnected) return;

        try {
            let details = `📚 ${state.currentClass.replace('Free Class ', '')}`;
            let activityState = `📖 HSC Advance | ${state.currentSubject}`;
            let largeImageText = "Higher Secondary Certificate - Advanced Course | Pioneer Batch";
            let smallImageText = "Pioneer Batch";

            // Enhanced activity with detailed class information
            if (state.classDetails) {
                const { fullSubject, lesson, chapter, topics, code } = state.classDetails;

                // Build details line
                if (lesson && fullSubject) {
                    details = `📚 ${fullSubject} - ${lesson}`;
                } else if (fullSubject) {
                    details = `📚 ${fullSubject}`;
                }

                // Build state line with topics (max 128 characters)
                let stateComponents = [];
                
                if (chapter) {
                    stateComponents.push(`📖 ${chapter}`);
                }

                if (topics && topics.length > 0) {
                    // Join all topics and prepare for truncation
                    const allTopics = topics.join(", ");
                    const topicsPrefix = "Topics: ";
                    
                    // Calculate available space for topics
                    const baseState = stateComponents.join(" | ");
                    const separator = stateComponents.length > 0 ? " | " : "";
                    const availableSpace = 128 - baseState.length - separator.length - topicsPrefix.length;
                    
                    if (availableSpace > 10) { // Minimum space for meaningful topics
                        let truncatedTopics = allTopics;
                        if (allTopics.length > availableSpace) {
                            // Truncate and add ellipsis
                            truncatedTopics = allTopics.substring(0, availableSpace - 3) + "...";
                        }
                        stateComponents.push(`${topicsPrefix}${truncatedTopics}`);
                    }
                }

                // Ensure final state doesn't exceed 128 characters
                activityState = stateComponents.join(" | ");
                if (activityState.length > 128) {
                    activityState = activityState.substring(0, 125) + "...";
                }

                // Update small image text with subject code
                if (code) {
                    smallImageText = code;
                }
            }

            state.rpc.setActivity({
                details: details,
                state: activityState,
                startTimestamp: state.startTime,
                largeImageKey: "udvash-logo",
                largeImageText: largeImageText,
                smallImageKey: "book",
                smallImageText: smallImageText,
                instance: false,
            });

            console.log(`📱 Activity updated: ${details} | ${activityState}`);
        } catch (error) {
            console.error("Failed to update activity:", error.message);
            state.isConnected = false;
        }
    }

    static clearActivity() {
        if (!state.rpc || !state.isConnected) return;
        
        try {
            state.rpc.clearActivity();
            console.log("🧹 Activity cleared");
        } catch (error) {
            console.error("Failed to clear activity:", error.message);
            state.isConnected = false;
        }
    }

    static attemptReconnection() {
        if (state.reconnectTimeout || state.reconnectAttempts >= CONFIG.maxReconnectAttempts) {
            return;
        }

        state.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), 30000);
        
        console.log(`🔄 Attempting reconnection ${state.reconnectAttempts}/${CONFIG.maxReconnectAttempts} in ${delay/1000}s...`);
        
        state.reconnectTimeout = setTimeout(async () => {
            state.reconnectTimeout = null;
            
            try {
                await this.connect();
            } catch (error) {
                if (state.reconnectAttempts < CONFIG.maxReconnectAttempts) {
                    this.attemptReconnection();
                } else {
                    console.log("⚠️  Max reconnection attempts reached. Waiting for Discord restart...");
                    setTimeout(() => {
                        state.reconnectAttempts = 0;
                    }, 300000); // Reset after 5 minutes
                }
            }
        }, delay);
    }
}

// Monitoring system
class Monitor {
    static start() {
        if (state.monitoringInterval) return;
        
        state.monitoringInterval = setInterval(() => {
            try {
                const timeSinceLastHeartbeat = new Date() - state.lastHeartbeat;
                
                if (timeSinceLastHeartbeat > CONFIG.heartbeatTimeout) {
                    console.log(`⏰ No heartbeat for ${CONFIG.heartbeatTimeout/1000}s - deactivating RPC`);
                    DiscordRPC.deactivate();
                } else if (state.isActive && state.isConnected) {
                    DiscordRPC.updateActivity();
                }
                
                if (!state.isConnected && state.reconnectAttempts === 0) {
                    console.log("🔗 Connection lost, attempting to reconnect...");
                    DiscordRPC.attemptReconnection();
                }
                
            } catch (error) {
                console.error("Monitor error:", error.message);
            }
        }, CONFIG.monitorInterval);
        
        console.log("👁️  Monitoring started");
    }

    static stop() {
        if (state.monitoringInterval) {
            clearInterval(state.monitoringInterval);
            state.monitoringInterval = null;
        }
        
        if (state.reconnectTimeout) {
            clearTimeout(state.reconnectTimeout);
            state.reconnectTimeout = null;
        }
        
        console.log("👁️  Monitoring stopped");
    }
}

// API Endpoints
app.post("/heartbeat", (req, res) => {
    try {
        state.updateClassInfo(req.body);
        
        if (req.body.test) {
            console.log("🧪 Test heartbeat received");
        }
        
        if (!state.isActive && state.isConnected) {
            DiscordRPC.activate();
        } else if (state.isActive && state.isConnected) {
            DiscordRPC.updateActivity();
        } else if (!state.isConnected) {
            DiscordRPC.attemptReconnection();
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Heartbeat error:", error.message);
        res.status(500).json({ error: "Heartbeat failed" });
    }
});

app.post("/update", (req, res) => {
    try {
        state.updateClassInfo(req.body);
        console.log(`📝 Direct update: ${state.currentClass} - ${state.currentSubject}`);
        
        if (!state.isActive && state.isConnected) {
            DiscordRPC.activate();
        } else if (state.isActive && state.isConnected) {
            DiscordRPC.updateActivity();
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Update error:", error.message);
        res.status(500).json({ error: "Update failed" });
    }
});

app.post("/stop", (req, res) => {
    try {
        console.log("🛑 Manual stop requested");
        DiscordRPC.deactivate();
        res.json({ success: true, message: "Discord RPC stopped" });
    } catch (error) {
        console.error("Stop error:", error.message);
        res.status(500).json({ error: "Stop failed" });
    }
});

app.get("/status", (req, res) => {
    try {
        res.json({
            connected: state.isConnected,
            active: state.isActive,
            currentClass: state.currentClass,
            currentSubject: state.currentSubject,
            lastHeartbeat: state.lastHeartbeat.toISOString(),
            uptime: Math.floor((new Date() - state.startTime) / 1000),
            details: state.classDetails,
            reconnectAttempts: state.reconnectAttempts
        });
    } catch (error) {
        console.error("Status error:", error.message);
        res.status(500).json({ error: "Status check failed" });
    }
});

// Application lifecycle
async function initialize() {
    try {
        console.log("🚀 Starting Enhanced Discord RPC Server...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        await DiscordRPC.connect();
        Monitor.start();
        
        console.log("✅ Discord RPC server ready!");
        console.log(`📡 Listening on http://localhost:${CONFIG.port}`);
        console.log("");
        console.log("📚 Endpoints:");
        console.log("   POST /heartbeat - Keep RPC active with class info");
        console.log("   POST /update    - Direct class info update");
        console.log("   POST /stop      - Manually stop RPC");
        console.log("   GET  /status    - Get current status");
        console.log("");
        console.log("🔄 PERSISTENT MODE: RPC stays active until manual stop or timeout");
        console.log(`⏰ Timeout: ${CONFIG.heartbeatTimeout/1000} seconds without heartbeat`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
    } catch (error) {
        console.error("❌ Initial connection failed:", error.message);
        console.log("⏳ Will retry when Discord becomes available...");
        Monitor.start();
    }
}

// Start server
app.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP server running on port ${CONFIG.port}`);
    initialize();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    Monitor.stop();
    if (state.rpc) {
        try {
            state.rpc.destroy();
        } catch (e) {
            console.log('RPC cleanup completed');
        }
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled rejection:', reason);
});