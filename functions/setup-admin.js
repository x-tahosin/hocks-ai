/**
 * HOCKS Admin Setup Script
 * Run this once to initialize admin email in Firestore
 * 
 * Usage: node scripts/setup-admin.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS)
initializeApp();

const db = getFirestore();

async function setupAdmin() {
    const adminEmail = 'x.tahosin@gmail.com';

    console.log('🔧 Setting up admin configuration...');

    try {
        // Set admin email in Firestore
        await db.doc('admin/settings').set({
            config: {
                adminEmail: adminEmail
            },
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`✅ Admin email set to: ${adminEmail}`);
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Deploy Cloud Functions: firebase deploy --only functions');
        console.log('2. Navigate to /admin while logged in as the admin email');
        console.log('3. Click "Initialize Admin Access" to set custom claims');

    } catch (error) {
        console.error('❌ Failed to setup admin:', error.message);
        process.exit(1);
    }
}

setupAdmin();
