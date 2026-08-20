const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const DigitalCard = require('../models/DigitalCard');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Ensure QR directory exists
const QR_DIR = path.join(__dirname, '../..', 'uploads', 'qr');
if (!fs.existsSync(QR_DIR)) {
    fs.mkdirSync(QR_DIR, { recursive: true });
}

// GET /api/admin/sub-admins
router.get('/sub-admins', protect, adminOnly, async (req, res) => {
    try {
        const subAdmins = await User.find({ role: 'SUB_ADMIN', isDeleted: false }).select('-passwordHash');
        res.json(subAdmins);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sub admins' });
    }
});

// POST /api/admin/sub-admins
router.post('/sub-admins', protect, adminOnly, async (req, res) => {
    const { fullName, username, password, email, mobile, companyName, designation } = req.body;

    // Reject if password is missing
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be provided and at least 6 characters long.' });
    }

    try {
        if (!username || !username.includes('@') || !username.includes('.')) {
            return res.status(400).json({ message: 'Username must be a valid email format containing "@" and "."' });
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        if (email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.status(400).json({ message: 'Email is already registered' });
            }
        }

        const slug = username;
        const existingSlug = await User.findOne({ slug });
        if (existingSlug) {
            return res.status(400).json({ message: 'Slug already generated' });
        }

        // Hash custom assigned password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const permanentUrl = `https://yourdomain.com/${slug}`;
        const nfcUrl = permanentUrl;

        // Generate QR code
        const qrFilename = `${slug}-qr.png`;
        const qrPath = path.join(QR_DIR, qrFilename);
        const qrCodeUrl = `/uploads/qr/${qrFilename}`;

        await QRCode.toFile(qrPath, permanentUrl, {
            width: 1024,
            margin: 2
        });

        const newSubAdmin = new User({
            role: 'SUB_ADMIN',
            fullName,
            username,
            usernameLocked: true,
            email,
            mobile,
            passwordHash,
            mustChangePassword: false,
            profile: {
                companyName,
                designation,
                themeColor: req.body.themeColor || '#3b82f6'
            },
            slug,
            landingPageUrl: permanentUrl,
            nfcUrl,
            qrCodeUrl
        });

        const createdSubAdmin = await newSubAdmin.save();

        // Create an isolated DigitalCard linked to this new sub admin
        const newDigitalCard = new DigitalCard({
            ownerId: createdSubAdmin._id,
            slug: slug
        });
        await newDigitalCard.save();

        const responseData = createdSubAdmin.toObject();
        delete responseData.passwordHash;

        res.status(201).json(responseData);
    } catch (error) {
        console.error("Sub admin creation error:", error);
        res.status(500).json({ message: 'Error creating sub admin: ' + error.message, error: error.message, stack: error.stack });
    }
});

// POST /api/admin/sub-admins/:id/reset-password
router.post('/sub-admins/:id/reset-password', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN', isDeleted: false });
        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub Admin not found' });
        }

        const { newPassword } = req.body;
        const finalPassword = newPassword || `${subAdmin.username}@Previous`;
        const salt = await bcrypt.genSalt(10);

        subAdmin.passwordHash = await bcrypt.hash(finalPassword, salt);
        subAdmin.mustChangePassword = !newPassword;
        subAdmin.tokenVersion = (subAdmin.tokenVersion || 0) + 1;

        await subAdmin.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error resetting password' });
    }
});

// GET /api/admin/sub-admins/:id
router.get('/sub-admins/:id', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN', isDeleted: false }).select('-passwordHash');
        if (subAdmin) {
            res.json(subAdmin);
        } else {
            res.status(404).json({ message: 'Sub admin not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sub admin' });
    }
});

// PUT /api/admin/sub-admins/:id
router.put('/sub-admins/:id', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN', isDeleted: false });
        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub Admin not found' });
        }

        const processBase64Media = (base64String, fieldName) => {
            if (!base64String || !base64String.startsWith('data:')) return base64String;

            try {
                const uploadDir = path.join(__dirname, '../../uploads/media');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const parts = base64String.split(';base64,');
                if (parts.length === 2 && parts[0].startsWith('data:')) {
                    const mimeType = parts[0].replace('data:', '');
                    const ext = mimeType.split('/')[1] || 'png';
                    const buffer = Buffer.from(parts[1], 'base64');
                    const fileName = `${fieldName}_${req.params.id}_${Date.now()}.${ext}`;
                    fs.writeFileSync(path.join(uploadDir, fileName), buffer);
                    return `/uploads/media/${fileName}`;
                }
            } catch (err) {
                console.error(`Error saving ${fieldName} to disk:`, err);
                throw new Error(`Failed to save uploaded ${fieldName} media. File might be invalid or disk is full.`);
            }

            // If it starts with data: and failed to process cleanly, do not leak 17MB strings to Mongo!
            if (base64String.startsWith('data:')) {
                throw new Error(`Received unparsable base64 string for ${fieldName}. Check file format.`);
            }

            return base64String;
        };

        // Allowed fields to update
        if (req.body.fullName) subAdmin.fullName = req.body.fullName;
        if (req.body.email) subAdmin.email = req.body.email;
        if (req.body.mobile) subAdmin.mobile = req.body.mobile;

        if (req.body.profile) {
            if (req.body.profile.companyName !== undefined) subAdmin.profile.companyName = req.body.profile.companyName;
            if (req.body.profile.designation !== undefined) subAdmin.profile.designation = req.body.profile.designation;
            if (req.body.profile.photo !== undefined) {
                subAdmin.profile.photo = processBase64Media(req.body.profile.photo, 'profile_photo');
            }
            if (req.body.profile.coverImage !== undefined) {
                subAdmin.profile.coverImage = processBase64Media(req.body.profile.coverImage, 'profile_cover');
            }
            if (req.body.profile.description !== undefined) subAdmin.profile.description = req.body.profile.description;
        }

        if (req.body.contact) {
            subAdmin.contact = { ...subAdmin.contact, ...req.body.contact };
        }

        if (req.body.socialLinks) {
            subAdmin.socialLinks = { ...subAdmin.socialLinks, ...req.body.socialLinks };
        }

        await subAdmin.save();

        const responseData = subAdmin.toObject();
        delete responseData.passwordHash;

        res.json(responseData);
    } catch (error) {
        res.status(500).json({ message: 'Error updating sub admin' });
    }
});

// GET /api/admin/sub-admins/:id/digital-card
router.get('/sub-admins/:id/digital-card', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN' });
        if (!subAdmin) return res.status(404).json({ message: 'Sub Admin not found' });

        let card = await DigitalCard.findOne({ ownerId: subAdmin._id });
        if (!card) {
            const cardSlug = subAdmin.slug || (subAdmin.username ? subAdmin.username.split('@')[0] : 'card-' + Date.now());
            card = new DigitalCard({
                ownerId: subAdmin._id,
                slug: cardSlug,
                hero: {
                    name: subAdmin.fullName || '',
                    designation: subAdmin.profile?.designation || '',
                    company: subAdmin.profile?.companyName || '',
                    description: subAdmin.profile?.description || '',
                    photo: subAdmin.profile?.photo || '',
                    coverImage: subAdmin.profile?.coverImage || ''
                },
                contact: {
                    phone: subAdmin.contact?.phone || subAdmin.mobile || '',
                    whatsapp: subAdmin.contact?.whatsapp || '',
                    email: subAdmin.contact?.email || subAdmin.email || '',
                    website: subAdmin.contact?.website || '',
                    googleMap: subAdmin.contact?.maps || ''
                },
                socialLinks: subAdmin.socialLinks || {}
            });
            await card.save();
        }
        res.json(card);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching digital card for sub admin' });
    }
});

// PUT /api/admin/sub-admins/:id/digital-card
router.put('/sub-admins/:id/digital-card', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN' });
        if (!subAdmin) return res.status(404).json({ message: 'Sub Admin not found' });

        const { hero, mainSection, contact, socialLinks, footer, design } = req.body;
        let card = await DigitalCard.findOne({ ownerId: subAdmin._id });

        if (!card) {
            const cardSlug = subAdmin.slug || (subAdmin.username ? subAdmin.username.split('@')[0] : 'card-' + Date.now());
            card = new DigitalCard({
                ownerId: subAdmin._id,
                slug: cardSlug,
                hero: {
                    name: subAdmin.fullName || '',
                    designation: subAdmin.profile?.designation || '',
                    company: subAdmin.profile?.companyName || '',
                    description: subAdmin.profile?.description || '',
                    photo: subAdmin.profile?.photo || '',
                    coverImage: subAdmin.profile?.coverImage || ''
                },
                contact: {
                    phone: subAdmin.contact?.phone || subAdmin.mobile || '',
                    whatsapp: subAdmin.contact?.whatsapp || '',
                    email: subAdmin.contact?.email || subAdmin.email || '',
                    website: subAdmin.contact?.website || '',
                    googleMap: subAdmin.contact?.maps || ''
                },
                socialLinks: subAdmin.socialLinks || {}
            });
        }

        const processBase64Media = (base64String, fieldName) => {
            if (!base64String || !base64String.startsWith('data:')) return base64String;
            try {
                const uploadDir = path.join(__dirname, '../../uploads/media');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                const parts = base64String.split(';base64,');
                if (parts.length === 2 && parts[0].startsWith('data:')) {
                    const mimeType = parts[0].replace('data:', '');
                    const ext = mimeType.split('/')[1] || 'png';
                    const buffer = Buffer.from(parts[1], 'base64');
                    const fileName = `${fieldName}_${req.params.id}_${Date.now()}.${ext}`;
                    fs.writeFileSync(path.join(uploadDir, fileName), buffer);
                    return `/uploads/media/${fileName}`;
                }
            } catch (err) {
                console.error(`Error saving ${fieldName} to disk:`, err);
                throw new Error(`Failed to save uploaded ${fieldName} media. File might be invalid or disk is full.`);
            }

            if (base64String.startsWith('data:')) {
                throw new Error(`Received unparsable base64 string for ${fieldName}. Check file format.`);
            }

            return base64String;
        };

        if (hero) {
            if (hero.coverVideo) hero.coverVideo = processBase64Media(hero.coverVideo, 'cover_video');
            if (hero.coverImage) hero.coverImage = processBase64Media(hero.coverImage, 'cover_image');
            if (hero.image) hero.image = processBase64Media(hero.image, 'image');
            if (hero.logo) hero.logo = processBase64Media(hero.logo, 'logo');
            if (hero.photo) hero.photo = processBase64Media(hero.photo, 'photo');
        }

        const currentCard = card.toObject();
        const updatePayload = {};
        if (hero) updatePayload.hero = { ...currentCard.hero, ...hero };
        if (mainSection) updatePayload.mainSection = { ...currentCard.mainSection, ...mainSection };
        if (contact) updatePayload.contact = { ...currentCard.contact, ...contact };
        if (socialLinks) updatePayload.socialLinks = { ...currentCard.socialLinks, ...socialLinks };
        if (footer) updatePayload.footer = { ...currentCard.footer, ...footer };
        if (design) updatePayload.design = { ...currentCard.design, ...design };

        const updatedCard = await DigitalCard.findOneAndUpdate(
            { _id: card._id },
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        console.log(`\n--- MASTER ADMIN: DIGITAL CARD UPDATE ---`);
        console.log(`ownerId: ${updatedCard.ownerId}`);
        console.log(`slug: ${updatedCard.slug}`);
        console.log(`DigitalCard._id: ${updatedCard._id}`);
        console.log(`updatedAt: ${updatedCard.updatedAt}`);
        console.log(`hero.name: ${updatedCard.hero?.name}`);
        console.log(`contact.phone: ${updatedCard.contact?.phone}`);
        console.log(`design.primaryColor: ${updatedCard.design?.primaryColor}`);
        console.log(`-----------------------------------------\n`);

        res.json(updatedCard);
    } catch (error) {
        console.error("Master Admin Digital Card Update Error", error);
        if (error.message === 'Unable to process this media file. Please try another image or video.') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error updating sub admin digital card' });
    }
});

// DELETE /api/admin/sub-admins/:id
router.delete('/sub-admins/:id', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN' });
        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub Admin not found' });
        }

        const timestamp = Date.now();
        subAdmin.username = `${subAdmin.username}_deleted_${timestamp}`;
        if (subAdmin.email) {
            subAdmin.email = `${subAdmin.email}_deleted_${timestamp}`;
        }
        subAdmin.slug = `${subAdmin.slug}_deleted_${timestamp}`;

        subAdmin.isDeleted = true;
        subAdmin.status = 'deleted';
        await subAdmin.save();

        await DigitalCard.findOneAndUpdate(
            { ownerId: subAdmin._id },
            { $set: { slug: subAdmin.slug } }
        );

        res.json({ message: 'Sub Admin successfully deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting sub admin' });
    }
});

// GET /api/admin/sub-admins/:id/qr
router.get('/sub-admins/:id/qr', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN' });
        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub Admin not found' });
        }
        res.json({ qrCodeUrl: subAdmin.qrCodeUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching QR URL' });
    }
});

// GET /api/admin/sub-admins/:id/nfc
router.get('/sub-admins/:id/nfc', protect, adminOnly, async (req, res) => {
    try {
        const subAdmin = await User.findOne({ _id: req.params.id, role: 'SUB_ADMIN' });
        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub Admin not found' });
        }
        res.json({ nfcUrl: subAdmin.nfcUrl, nfcStatus: 'Active' });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching NFC URL' });
    }
});

module.exports = router;
