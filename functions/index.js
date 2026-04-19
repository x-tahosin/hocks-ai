/**
 * HOCKS AI - Firebase Cloud Functions
 * All Gemini API calls go through these secure endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { defineSecret } from 'firebase-functions/params'

// Initialize Firebase Admin
initializeApp()
const db = getFirestore()
const adminAuth = getAuth()

// Define API key as a secret (set via: firebase functions:secrets:set GEMINI_API_KEY)
const geminiApiKey = defineSecret('GEMINI_API_KEY')

// Estimated cost per API call type (USD)
const COST_RATES = {
    chat: 0.0015,
    chatNonStream: 0.0015,
    image: 0.002,
    video: 0.003,
    website: 0.008
}

/**
 * Helper: Track cost for credit usage monitoring
 */
async function trackCost(type, estimatedCost) {
    try {
        const today = new Date().toISOString().split('T')[0]
        const costRef = db.collection('analytics').doc('costs')
        const dailyCostRef = db.collection('analytics').doc('costs').collection('daily').doc(today)

        // Update total costs
        await costRef.set({
            [`${type}Cost`]: FieldValue.increment(estimatedCost),
            totalCost: FieldValue.increment(estimatedCost),
            lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true })

        // Update daily costs
        await dailyCostRef.set({
            [`${type}Cost`]: FieldValue.increment(estimatedCost),
            totalCost: FieldValue.increment(estimatedCost),
            calls: FieldValue.increment(1)
        }, { merge: true })
    } catch (error) {
        console.error('[HOCKS] Cost tracking failed:', error)
    }
}

// System prompt for HOCKS AI
const SYSTEM_PROMPT = `You are HOCKS AI, a premium multi-modal AI assistant. You are:
- Highly capable and knowledgeable
- Conversational but concise
- Helpful with coding, analysis, creativity, and problem-solving
- Able to analyze images, documents, and other files when provided
- Always maintaining context from previous messages

When analyzing files, describe what you observe and provide helpful insights.
Format responses with markdown when appropriate (headers, bold, code blocks).`

/**
 * Chat with Gemini - Streaming response via SSE
 * This is an HTTP endpoint that streams responses
 */
export const streamChat = onRequest(
    {
        secrets: [geminiApiKey],
        cors: true,
        maxInstances: 10
    },
    async (req, res) => {
        console.log('[HOCKS Function] streamChat called')

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed')
            return
        }

        try {
            const { messages, memories = [] } = req.body

            if (!messages || !Array.isArray(messages)) {
                res.status(400).send('Messages array required')
                return
            }

            console.log('[HOCKS Function] Messages count:', messages.length)

            // Initialize Gemini
            const apiKey = geminiApiKey.value().trim()
            const genAI = new GoogleGenerativeAI(apiKey)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            // Build context with memories
            let systemInstruction = SYSTEM_PROMPT
            if (memories.length > 0) {
                systemInstruction += "\n\n=== USER'S SAVED MEMORIES ===\n"
                memories.forEach((mem, i) => {
                    systemInstruction += `${i + 1}. ${mem.content}\n`
                })
                systemInstruction += "=== END MEMORIES ===\n"
            }

            // Set up SSE headers for streaming
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('Access-Control-Allow-Origin', '*')

            // Start chat with streaming
            const chat = model.startChat({
                history: messages.slice(0, -1),
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 8192
                }
            })

            const lastMessage = messages[messages.length - 1]
            const result = await chat.sendMessageStream(lastMessage.parts)

            let fullText = ''

            // Stream each chunk as SSE
            for await (const chunk of result.stream) {
                const text = chunk.text()
                if (text) {
                    fullText += text
                    console.log('[HOCKS Function] Streaming chunk:', text.substring(0, 30) + '...')
                    res.write(`data: ${JSON.stringify({ text, fullText })}\n\n`)
                }
            }

            // Send completion signal
            res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`)
            res.end()

            console.log('[HOCKS Function] Stream completed, total length:', fullText.length)

            // Track cost
            await trackCost('chat', COST_RATES.chat)

        } catch (error) {
            console.error('[HOCKS Function] Error:', error)

            // Log to Firestore for debugging
            try {
                await db.collection('errors').add({
                    function: 'streamChat',
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                })
            } catch (logError) {
                console.error('[HOCKS Function] Failed to log error:', logError)
            }

            res.status(500).json({ error: error.message })
        }
    }
)

/**
 * Chat with Gemini - Single response (non-streaming)
 */
export const chatWithGemini = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 10
    },
    async (request) => {
        console.log('[HOCKS Function] chatWithGemini called')

        const { messages, memories = [] } = request.data

        if (!messages || !Array.isArray(messages)) {
            throw new HttpsError('invalid-argument', 'Messages array required')
        }

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey.value().trim())
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            let systemInstruction = SYSTEM_PROMPT
            if (memories.length > 0) {
                systemInstruction += "\n\n=== USER'S SAVED MEMORIES ===\n"
                memories.forEach((mem, i) => {
                    systemInstruction += `${i + 1}. ${mem.content}\n`
                })
                systemInstruction += "=== END MEMORIES ==="
            }

            const result = await model.generateContent({
                contents: messages,
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 8192
                }
            })

            const response = result.response.text()
            console.log('[HOCKS Function] Response length:', response.length)

            // Track cost
            await trackCost('chat', COST_RATES.chatNonStream)

            return { text: response }

        } catch (error) {
            console.error('[HOCKS Function] Error:', error)

            await db.collection('errors').add({
                function: 'chatWithGemini',
                error: error.message,
                timestamp: new Date()
            })

            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Analyze Image with Gemini Vision
 */
export const analyzeImage = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 10
    },
    async (request) => {
        console.log('[HOCKS Function] analyzeImage called')

        const { imageBase64, mimeType, prompt = 'Analyze this image in detail.' } = request.data

        if (!imageBase64) {
            throw new HttpsError('invalid-argument', 'Image data required')
        }

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey.value().trim())
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            const result = await model.generateContent({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType || 'image/jpeg',
                                data: imageBase64
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 4096
                }
            })

            const analysis = result.response.text()
            console.log('[HOCKS Function] Image analysis length:', analysis.length)

            // Track cost
            await trackCost('image', COST_RATES.image)

            return { analysis }

        } catch (error) {
            console.error('[HOCKS Function] Error:', error)

            await db.collection('errors').add({
                function: 'analyzeImage',
                error: error.message,
                timestamp: new Date()
            })

            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Generate Website Code
 */
export const generateCode = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 10,
        timeoutSeconds: 120
    },
    async (request) => {
        console.log('[HOCKS Function] generateCode called')

        const { prompt, existingCode } = request.data

        if (!prompt) {
            throw new HttpsError('invalid-argument', 'Prompt required')
        }

        const systemPrompt = `You are an elite frontend developer and UI/UX designer who creates stunning, production-ready websites.

ABSOLUTE RULES:
1. Generate a COMPLETE, SINGLE HTML file with ALL CSS and JavaScript embedded inline.
2. The output must be ONLY the raw HTML code — no markdown fences, no explanations, no commentary.
3. Every page/section must be contained in this ONE file using JavaScript-based client-side routing (hash routing or show/hide sections). NEVER use separate files or links to other HTML pages.
4. All navigation links MUST work within the single file — clicking "About", "Services", "Contact" etc. must scroll to or reveal that section, NOT navigate to a blank page.

VISUAL DESIGN STANDARDS (Premium, State-of-the-Art):
- Dark theme by default with rich accent colors (neon green, electric blue, purple gradients) unless user specifies otherwise
- Glassmorphism: use backdrop-filter: blur(), semi-transparent backgrounds (rgba), subtle borders
- Smooth gradients: linear-gradient and radial-gradient for backgrounds, buttons, and text
- Micro-animations: CSS transitions on hover (scale, color, shadow, transform), entrance animations using @keyframes
- 3D effects: use CSS perspective, transform: rotateX/Y, translateZ for depth and parallax-like effects
- Floating elements: use @keyframes for gentle float/bob animations on cards, icons, and decorative elements
- Particle-like effects: CSS-only animated dots/circles using pseudo-elements and keyframe animations
- Typography: import and use Google Fonts (Inter, Space Grotesk, or Outfit) — never use default browser fonts
- Smooth scroll: html { scroll-behavior: smooth }
- Box shadows: layered shadows for depth (e.g., 0 4px 6px rgba(...), 0 20px 40px rgba(...))
- Border glow effects on interactive elements
- Gradient text using background-clip: text where appropriate
- Responsive: use CSS Grid + Flexbox, media queries for mobile/tablet/desktop
- Interactive cursor effects where appropriate (hover transforms, color shifts)

CONTENT STANDARDS:
- Use realistic, high-quality placeholder content — not "Lorem ipsum"
- Use emoji or SVG icons for visual interest (no external icon libraries)
- Include proper meta viewport tag for responsive behavior
- All images should use placeholder services or CSS gradient/pattern backgrounds
- Buttons and CTAs should have hover/active states with smooth transitions

CODE QUALITY:
- Clean, well-structured HTML5 with semantic elements
- CSS custom properties (variables) for the color palette
- JavaScript for any interactivity (smooth scroll, mobile menu toggle, section navigation)
- No external dependencies — everything must work standalone in a browser

${existingCode ? `
EDIT MODE — The user wants to MODIFY their existing website. Here is the current code:
--- EXISTING CODE START ---
${existingCode}
--- EXISTING CODE END ---

Apply the user's requested changes while keeping the overall structure and design intact. Only modify what the user asks for.` : ''}`

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey.value().trim())
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 65536
                }
            })

            const code = result.response.text()
            console.log('[HOCKS Function] Code generation length:', code.length)

            // Track cost
            await trackCost('website', COST_RATES.website)

            return { code }

        } catch (error) {
            console.error('[HOCKS Function] Error:', error)

            await db.collection('errors').add({
                function: 'generateCode',
                error: error.message,
                timestamp: new Date()
            })

            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Analyze Video (frame-by-frame analysis description)
 */
export const analyzeVideo = onCall(
    {
        secrets: [geminiApiKey],
        maxInstances: 10
    },
    async (request) => {
        console.log('[HOCKS Function] analyzeVideo called')

        const { prompt, videoName } = request.data

        if (!prompt && !videoName) {
            throw new HttpsError('invalid-argument', 'Prompt or video name required')
        }

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey.value().trim())
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            const analysisPrompt = `I have a video named "${videoName || 'uploaded video'}". 
${prompt || 'Please provide a comprehensive video analysis template covering: content summary, visual style, technical quality, key moments, and suggested improvements.'}`

            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
                generationConfig: {
                    temperature: 0.5,
                    maxOutputTokens: 4096
                }
            })

            const analysis = result.response.text()
            console.log('[HOCKS Function] Video analysis length:', analysis.length)

            // Track cost
            await trackCost('video', COST_RATES.video)

            return { analysis }

        } catch (error) {
            console.error('[HOCKS Function] Error:', error)

            await db.collection('errors').add({
                function: 'analyzeVideo',
                error: error.message,
                timestamp: new Date()
            })

            throw new HttpsError('internal', error.message)
        }
    }
)

// ============================================
// ADMIN FUNCTIONS - Secure Admin-Only Endpoints
// ============================================

/**
 * Helper: Get admin email from Firestore config
 * Admin email is stored in Firestore, not hardcoded
 */
async function getAdminEmail() {
    const configDoc = await db.collection('admin').doc('settings').get()
    if (configDoc.exists && configDoc.data().adminEmail) {
        return configDoc.data().adminEmail
    }
    // Fallback - will be set during initial setup
    return null
}

/**
 * Helper: Verify admin access for any request
 * Checks email match and auto-sets claims if needed
 */
async function verifyAdminAccess(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required')
    }

    const userEmail = request.auth.token.email
    const adminEmail = await getAdminEmail()

    if (!adminEmail) {
        throw new HttpsError('failed-precondition', 'Admin not configured')
    }

    if (userEmail !== adminEmail) {
        throw new HttpsError('permission-denied', 'Admin access required')
    }

    // Auto-bootstrap: set claims if email matches but claims aren't set
    const userRecord = await adminAuth.getUser(request.auth.uid)
    if (!userRecord.customClaims?.admin) {
        console.log('[HOCKS Admin] Auto-setting admin claims for:', userEmail)
        await adminAuth.setCustomUserClaims(request.auth.uid, { admin: true })
        await logAdminAction(request.auth.uid, 'ADMIN_AUTO_BOOTSTRAP', { email: userEmail })
    }

    return true
}

/**
 * Helper: Log admin actions for audit trail
 */
async function logAdminAction(adminUid, action, details) {
    try {
        await db.collection('admin').doc('auditLogs').collection('logs').add({
            adminUid,
            action,
            details,
            timestamp: FieldValue.serverTimestamp()
        })
    } catch (error) {
        console.error('[HOCKS Admin] Failed to log action:', error)
    }
}

/**
 * Verify Admin - Check if current user is admin
 * Called by frontend to validate admin access
 */
export const verifyAdmin = onCall(
    { maxInstances: 5 },
    async (request) => {
        console.log('[HOCKS Admin] verifyAdmin called')

        if (!request.auth || !request.auth.uid) {
            return { isAdmin: false }
        }

        try {
            const userEmail = request.auth.token.email
            const adminEmail = await getAdminEmail()

            if (!adminEmail || userEmail !== adminEmail) {
                return { isAdmin: false }
            }

            // Auto-bootstrap: set claims if email matches but claims aren't set
            const userRecord = await adminAuth.getUser(request.auth.uid)
            if (!userRecord.customClaims?.admin) {
                console.log('[HOCKS Admin] Auto-bootstrapping admin claims for:', userEmail)
                await adminAuth.setCustomUserClaims(request.auth.uid, { admin: true })
                await logAdminAction(request.auth.uid, 'ADMIN_AUTO_BOOTSTRAP', { email: userEmail })
            }

            return { isAdmin: true }
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            return { isAdmin: false }
        }
    }
)

/**
 * Set Admin Role - One-time setup to assign admin custom claim
 * Can only be called by the configured admin email
 */
export const setAdminRole = onCall(
    { maxInstances: 1 },
    async (request) => {
        console.log('[HOCKS Admin] setAdminRole called')

        if (!request.auth || !request.auth.uid) {
            throw new HttpsError('unauthenticated', 'Authentication required')
        }

        const userEmail = request.auth.token.email
        const adminEmail = await getAdminEmail()

        // If admin not configured yet, allow first setup
        if (!adminEmail) {
            // First-time setup - set this user as admin
            await db.collection('admin').doc('settings').set({
                adminEmail: userEmail,
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true })

            // Set custom claims
            await adminAuth.setCustomUserClaims(request.auth.uid, { admin: true })

            await logAdminAction(request.auth.uid, 'ADMIN_SETUP', { email: userEmail })

            return { success: true, message: 'Admin role assigned' }
        }

        // Only existing admin can call this
        if (userEmail !== adminEmail) {
            throw new HttpsError('permission-denied', 'Only admin can set admin role')
        }

        // Refresh admin claims
        await adminAuth.setCustomUserClaims(request.auth.uid, { admin: true })

        await logAdminAction(request.auth.uid, 'ADMIN_REFRESH', { email: userEmail })

        return { success: true, message: 'Admin claims refreshed' }
    }
)

/**
 * Update API Key - Manage API keys for features
 * Keys are stored in Firebase Secrets, only metadata in Firestore
 */
export const updateApiKey = onCall(
    { maxInstances: 2 },
    async (request) => {
        console.log('[HOCKS Admin] updateApiKey called')

        await verifyAdminAccess(request)

        const { feature, keyMask, status, model } = request.data

        if (!feature || !['chat', 'image', 'video', 'website'].includes(feature)) {
            throw new HttpsError('invalid-argument', 'Valid feature required')
        }

        try {
            const updateData = {
                lastUpdated: FieldValue.serverTimestamp(),
                updatedBy: request.auth.uid
            }

            if (keyMask) updateData.keyMask = keyMask // Store only masked version
            if (status) updateData.status = status // 'active' or 'disabled'
            if (model) updateData.model = model // e.g., 'gemini-2.0-flash'

            await db.collection('admin').doc('apiKeys').set({
                [feature]: updateData
            }, { merge: true })

            await logAdminAction(request.auth.uid, 'UPDATE_API_KEY', { feature, status, model })

            return { success: true }
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Toggle Feature - Enable/disable platform features
 */
export const toggleFeature = onCall(
    { maxInstances: 2 },
    async (request) => {
        console.log('[HOCKS Admin] toggleFeature called')

        await verifyAdminAccess(request)

        const { feature, enabled } = request.data

        if (!feature || !['chat', 'image', 'video', 'website'].includes(feature)) {
            throw new HttpsError('invalid-argument', 'Valid feature required')
        }

        if (typeof enabled !== 'boolean') {
            throw new HttpsError('invalid-argument', 'Enabled must be boolean')
        }

        try {
            await db.collection('admin').doc('featureToggles').set({
                [feature]: enabled,
                lastUpdated: FieldValue.serverTimestamp()
            }, { merge: true })

            await logAdminAction(request.auth.uid, 'TOGGLE_FEATURE', { feature, enabled })

            return { success: true }
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Check Feature Status - Check if a feature is enabled
 * Called by AI endpoints before processing
 */
export const checkFeatureStatus = onCall(
    { maxInstances: 10 },
    async (request) => {
        const { feature } = request.data

        if (!feature) {
            return { enabled: true } // Default to enabled if not specified
        }

        try {
            const togglesDoc = await db.collection('admin').doc('featureToggles').get()

            if (!togglesDoc.exists) {
                return { enabled: true } // Default to enabled if no config
            }

            const enabled = togglesDoc.data()[feature] !== false // Default true
            return { enabled }
        } catch (error) {
            console.error('[HOCKS Admin] Error checking feature:', error)
            return { enabled: true } // Fail open
        }
    }
)

/**
 * Fetch Analytics - Get platform analytics data
 */
export const fetchAnalytics = onCall(
    { maxInstances: 2 },
    async (request) => {
        console.log('[HOCKS Admin] fetchAnalytics called')

        await verifyAdminAccess(request)

        try {
            // Get totals
            const totalsDoc = await db.collection('analytics').doc('totals').get()
            const totals = totalsDoc.exists ? totalsDoc.data() : {
                totalVisitors: 0,
                totalUsers: 0,
                totalChatRequests: 0,
                totalImageGenerations: 0,
                totalVideoGenerations: 0,
                totalWebsiteGenerations: 0
            }

            // Get today's stats
            const today = new Date().toISOString().split('T')[0]
            const dailyDoc = await db.collection('analytics').doc('daily').collection('days').doc(today).get()
            const daily = dailyDoc.exists ? dailyDoc.data() : {
                visitors: 0,
                newUsers: 0,
                chatRequests: 0,
                imageGenerations: 0,
                videoGenerations: 0,
                websiteGenerations: 0,
                errors: 0
            }

            // Get feature toggles
            const togglesDoc = await db.collection('admin').doc('featureToggles').get()
            const toggles = togglesDoc.exists ? togglesDoc.data() : {
                chat: true,
                image: true,
                video: true,
                website: true
            }

            // Get API key status (metadata only, not actual keys)
            const apiKeysDoc = await db.collection('admin').doc('apiKeys').get()
            const apiKeys = apiKeysDoc.exists ? apiKeysDoc.data() : {}

            // Get recent audit logs
            const logsSnapshot = await db.collection('admin').doc('auditLogs')
                .collection('logs')
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get()

            const auditLogs = logsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null
            }))

            return {
                totals,
                daily,
                toggles,
                apiKeys,
                auditLogs
            }
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            throw new HttpsError('internal', error.message)
        }
    }
)

/**
 * Increment Analytics Counter - Called internally to track usage
 */
export const incrementAnalytics = onCall(
    { maxInstances: 20 },
    async (request) => {
        const { type } = request.data

        if (!type) return { success: false }

        const validTypes = ['chatRequest', 'imageGeneration', 'videoGeneration', 'websiteGeneration', 'visitor', 'error']
        if (!validTypes.includes(type)) return { success: false }

        try {
            const today = new Date().toISOString().split('T')[0]
            const dailyRef = db.collection('analytics').doc('daily').collection('days').doc(today)
            const totalsRef = db.collection('analytics').doc('totals')

            const fieldMap = {
                chatRequest: { daily: 'chatRequests', total: 'totalChatRequests' },
                imageGeneration: { daily: 'imageGenerations', total: 'totalImageGenerations' },
                videoGeneration: { daily: 'videoGenerations', total: 'totalVideoGenerations' },
                websiteGeneration: { daily: 'websiteGenerations', total: 'totalWebsiteGenerations' },
                visitor: { daily: 'visitors', total: 'totalVisitors' },
                error: { daily: 'errors', total: 'totalErrors' }
            }

            const fields = fieldMap[type]
            if (fields) {
                await dailyRef.set({ [fields.daily]: FieldValue.increment(1) }, { merge: true })
                await totalsRef.set({ [fields.total]: FieldValue.increment(1) }, { merge: true })
            }

            return { success: true }
        } catch (error) {
            console.error('[HOCKS Admin] Error incrementing analytics:', error)
            return { success: false }
        }
    }
)

/**
 * Initialize Admin Config - One-time HTTP endpoint to set admin email
 * Call this once via curl or browser to set up admin
 * URL: https://<region>-<project>.cloudfunctions.net/initAdminConfig?email=x.tahosin@gmail.com&secret=HOCKS_INIT_SECRET
 */
export const initAdminConfig = onRequest(
    { maxInstances: 1, cors: true },
    async (req, res) => {
        console.log('[HOCKS Admin] initAdminConfig called')

        // Simple secret to prevent unauthorized access
        const INIT_SECRET = 'HOCKS_SETUP_2026'

        const { email, secret } = req.query

        if (secret !== INIT_SECRET) {
            res.status(403).json({ error: 'Invalid secret' })
            return
        }

        if (!email || !email.includes('@')) {
            res.status(400).json({ error: 'Valid email required' })
            return
        }

        try {
            // Check if admin already configured
            const settingsDoc = await db.collection('admin').doc('settings').get()

            if (settingsDoc.exists && settingsDoc.data()?.adminEmail) {
                res.status(400).json({
                    error: 'Admin already configured',
                    currentAdmin: settingsDoc.data().adminEmail
                })
                return
            }

            // Set admin email
            await db.collection('admin').doc('settings').set({
                adminEmail: email,
                createdAt: FieldValue.serverTimestamp()
            })

            // Initialize feature toggles with defaults
            await db.collection('admin').doc('settings').set({
                toggles: {
                    chat: true,
                    image: true,
                    video: true,
                    website: true
                }
            }, { merge: true })

            console.log(`[HOCKS Admin] Admin email set to: ${email}`)

            res.json({
                success: true,
                message: `Admin email set to ${email}`,
                nextSteps: [
                    'Login with this email at /admin',
                    'Click "Initialize Admin Access" to get admin claims'
                ]
            })
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            res.status(500).json({ error: error.message })
        }
    }
)

/**
 * Get Credit Usage - Aggregated cost data for admin dashboard
 */
export const getCreditUsage = onCall(
    { maxInstances: 2 },
    async (request) => {
        console.log('[HOCKS Admin] getCreditUsage called')

        await verifyAdminAccess(request)

        try {
            const TOTAL_CREDIT = 300

            // Get total costs
            const costsDoc = await db.collection('analytics').doc('costs').get()
            const costs = costsDoc.exists ? costsDoc.data() : { totalCost: 0 }

            // Get last 7 days of daily costs
            const now = new Date()
            const dailyCosts = []
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now)
                date.setDate(date.getDate() - i)
                const dateStr = date.toISOString().split('T')[0]
                const dayDoc = await db.collection('analytics').doc('costs').collection('daily').doc(dateStr).get()
                dailyCosts.push({
                    date: dateStr,
                    ...(dayDoc.exists ? dayDoc.data() : { totalCost: 0, calls: 0 })
                })
            }

            return {
                totalCredit: TOTAL_CREDIT,
                totalUsed: costs.totalCost || 0,
                remaining: Math.max(0, TOTAL_CREDIT - (costs.totalCost || 0)),
                breakdown: {
                    chat: costs.chatCost || 0,
                    image: costs.imageCost || 0,
                    video: costs.videoCost || 0,
                    website: costs.websiteCost || 0
                },
                dailyCosts,
                lastUpdated: costs.lastUpdated || null
            }
        } catch (error) {
            console.error('[HOCKS Admin] Error:', error)
            throw new HttpsError('internal', error.message)
        }
    }
)
