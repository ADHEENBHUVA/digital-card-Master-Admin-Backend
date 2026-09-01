const dns = require('dns');
const mongoose = require('mongoose');
const app = require('../server'); // adapted for master admin

if (process.platform === 'win32') {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {
        // ignore
    }
}

let connPromise = null;

async function ensureDb() {
    if (mongoose.connection.readyState === 1) return;

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is missing on Vercel.');
    }

    if (!connPromise || mongoose.connection.readyState === 0) {
        connPromise = mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 8000,
        }).catch(err => {
            connPromise = null;
            throw err;
        });
    }

    await connPromise;
}

module.exports = async (req, res) => {
    try {
        await ensureDb();
    } catch (e) {
        console.error('DB connect (serverless) failed:', e.message);
        return res.status(500).json({
            success: false,
            message: `Database Connection Error: ${e.message}. Please verify MONGODB_URI and MongoDB Atlas Network Access (0.0.0.0/0).`
        });
    }
    return app(req, res);
};
