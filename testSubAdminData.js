const mongoose = require('mongoose');
const User = require('./models/User');

const testApi = async () => {
    try {
        console.log("Testing API fetch for Sub Admin...");

        await mongoose.connect('mongodb://Vinit04:DGFSFM15xAbnOvjV@ac-69epuyt-shard-00-00.9vaob4b.mongodb.net:27017,ac-69epuyt-shard-00-01.9vaob4b.mongodb.net:27017,ac-69epuyt-shard-00-02.9vaob4b.mongodb.net:27017/adheen3?ssl=true&replicaSet=atlas-ikf2zx-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0');

        const subAdmin = await User.findOne({ role: 'SUB_ADMIN' });

        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: subAdmin._id, role: subAdmin.role, tokenVersion: subAdmin.tokenVersion },
            'fallback_secret_key_change_me_in_prod',
            { expiresIn: '30d' }
        );

        console.log("Calling /api/auth/profile ...");
        const profileRes = await fetch(`http://localhost:5001/api/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Profile status: ${profileRes.status}, Body:`, await profileRes.text());

        console.log("Calling /api/digital-card/my-card ... (Testing if it returns valid card)");
        const cardRes = await fetch(`http://localhost:5001/api/digital-card/my-card`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Card status: ${cardRes.status}, Body length:`, (await cardRes.text()).length);

    } catch (err) {
        console.error("Test failed", err);
    } finally {
        process.exit(0);
    }
}
testApi();
