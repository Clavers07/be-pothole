const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const db = require('./db');

require('dotenv').config();

const app = express();

const SECRET_KEY =
    process.env.JWT_SECRET || "kunci_rahasia_jalan_berlubang";

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static('uploads'));


// ================= JWT =================

const authenticateToken = (req, res, next) => {

    const authHeader = req.headers['authorization'];

    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            message: "Token hilang"
        });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {

        if (err) {
            return res.status(403).json({
                message: "Token tidak valid"
            });
        }

        req.user = user;

        next();
    });

};


// ================= MULTER =================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        const dir = './uploads';

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        cb(null, dir);

    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }

});

const upload = multer({ storage });


// ================= LOGIN =================

app.post('/login', async (req, res) => {

    const { email, password } = req.body;

    try {

        const [rows] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {

            return res.status(400).json({
                message: "Kredensial salah"
            });

        }

        const token = jwt.sign(
            { id: user.id },
            SECRET_KEY,
            { expiresIn: '1h' }
        );

        res.json({ token });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});


// ================= CREATE  =================

app.post(
    '/jalan',
    authenticateToken,
    upload.single('foto'),

    async (req, res) => {

        const { nama_jalan, tingkat_kerusakan } = req.body;

        const foto = req.file ? req.file.filename : null;

        try {

            const [result] = await db.execute(
                'INSERT INTO jalan_berlubang (nama_jalan, tingkat_kerusakan, foto) VALUES (?, ?, ?)',
                [nama_jalan, tingkat_kerusakan, foto]
            );

            res.status(201).json({
                success: true,
                message: "Laporan berhasil ditambahkan",
                id: result.insertId
            });

        } catch (err) {

            res.status(500).json({
                error: err.message
            });

        }

    }
);


// ================= READ ALL =================

app.get('/jalan', authenticateToken, async (req, res) => {

    try {

        const [rows] = await db.execute(
            'SELECT * FROM jalan_berlubang ORDER BY id DESC'
        );

        const data = rows.map(item => ({
            id: item.id,
            nama_jalan: item.nama_jalan,
            tingkat_kerusakan: item.tingkat_kerusakan,
            foto: item.foto,
            foto_url: item.foto
                ? `http://10.0.2.2:3000/uploads/${item.foto}`
                : null
        }));

        res.json(data);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});


// ================= DELETE =================

app.delete('/jalan/:id', authenticateToken, async (req, res) => {

    const { id } = req.params;

    try {

        const [rows] = await db.execute(
            'SELECT foto FROM jalan_berlubang WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                message: "Laporan tidak ditemukan"
            });

        }

        if (rows[0].foto) {

            const filePath = path.join(
                __dirname,
                'uploads',
                rows[0].foto
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

        }

        await db.execute(
            'DELETE FROM jalan_berlubang WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: "Laporan berhasil dihapus"
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

});


// ================= RUN SERVER =================

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});