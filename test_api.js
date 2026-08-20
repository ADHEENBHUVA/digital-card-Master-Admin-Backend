(async () => {
    try {
        const mongoose = require('mongoose');
        require('dotenv').config();

        await mongoose.connect(process.env.MONGO_URI);
        const User = require('./models/User');

        const masterAdmin = await User.findOne({ role: 'MASTER_ADMIN' });

        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: masterAdmin._id, role: masterAdmin.role, username: masterAdmin.username, tokenVersion: masterAdmin.tokenVersion },
            process.env.JWT_SECRET || 'fallback_secret_key_change_me_in_prod',
            { expiresIn: '1h' }
        );

        const response = await fetch('http://localhost:5000/api/admin/sub-admins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fullName: "adheenbhuva07@gmail.com",
                username: "adheenbhuva07@gmail.com",
                password: "password123",
                email: "adheenbhuva07@gmail.com",
                mobile: "08347640423",
                companyName: "Appifly Infote",
                designation: "Owner"
            })
        });
        const resData = await response.json();

        const fs = require('fs');
        fs.writeFileSync('out.json', JSON.stringify(resData, null, 2));
    } catch (e) {
        console.error("ERROR from API:", e);
    }
    process.exit();
})();
