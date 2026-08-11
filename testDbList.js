const mongoose = require('mongoose');
const User = require('./models/User');

const testDb = async () => {
    try {
        await mongoose.connect('mongodb://Vinit04:DGFSFM15xAbnOvjV@ac-69epuyt-shard-00-00.9vaob4b.mongodb.net:27017,ac-69epuyt-shard-00-01.9vaob4b.mongodb.net:27017,ac-69epuyt-shard-00-02.9vaob4b.mongodb.net:27017/adheen3?ssl=true&replicaSet=atlas-ikf2zx-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0');
        
        const subAdmins = await User.find({ role: 'SUB_ADMIN', isDeleted: false }).select('-passwordHash');
        console.log("Sub Admins list length:", subAdmins.length);
        if (subAdmins.length > 0) {
            console.log("First Sub Admin:", subAdmins[0].fullName, subAdmins[0].username);
        }
    } catch (err) {
        console.error("Test failed", err);
    } finally {
        process.exit(0);
    }
}
testDb();
