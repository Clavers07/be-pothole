// 1. IMPORT SEMUA LIBRARY YANG DIBUTUHKAN
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db'); // Pastikan koneksi database sudah benar di db.js
require('dotenv').config();

// 2. INISIALISASI APP (INI SANGAT PENTING)
const app = express();
const SECRET_KEY = process.env.JWT_SECRET || "kunci_rahasia_bank_sampah";

// 3. MIDDLEWARE
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Akses gambar via browser

// Middleware Otorisasi JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Token hilang" });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: "Token tidak valid" });
        req.user = user;
        next();
    });
};

// 4. KONFIGURASI MULTER (UPLOAD GAMBAR)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 5. ROUTES LOGIN
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: "Kredensial salah" });
        }
        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGIN WAJAH ---
app.post('/login-face', async (req, res) => {
    const { face_label } = req.body;
    try {
        // PERHATIAN: Karena tabel 'users' Anda hanya memiliki kolom 'email' dan 'password',
        // maka kita cocokkan face_label dengan kolom 'email'.
        // Pastikan model Python Anda mengembalikan email pengguna sebagai face_label, 
        // atau ubah struktur database Anda untuk menambahkan kolom nama/id.
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [face_label]);
        const user = rows[0];

        if (!user) {
            return res.status(400).json({ message: `Wajah dikenali sebagai '${face_label}', tapi email/user tersebut tidak ditemukan di tabel users` });
        }

        // Buat token karena wajah valid dan user ditemukan
        // Karena tabel users tidak punya kolom id, kita gunakan email sebagai identifier di token
        const token = jwt.sign({ id: user.email }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. ROUTES CRUD SAMPAH
app.post('/sampah', authenticateToken, upload.single('pic'), async (req, res) => {
    const { nama_sampah } = req.body;
    const pic = req.file ? req.file.filename : null;
    try {
        const [result] = await db.execute(
            'INSERT INTO sampah (nama_sampah, pic) VALUES (?, ?)',
            [nama_sampah, pic]
        );
        res.status(201).json({ message: "Data berhasil ditambah", id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- READ ALL: Ambil Semua Data Sampah ---
app.get('/sampah', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM sampah');
        // Menambahkan URL lengkap untuk gambar agar bisa diakses langsung
        const dataDenganUrl = rows.map(item => ({
            ...item, pic_url: item.pic ? `${req.protocol}://${req.get('host')}/uploads/${item.pic}` : null
        }));
        res.json(dataDenganUrl);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- READ ONE: Ambil Satu Data Sampah Berdasarkan ID ---
app.get('/sampah/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM sampah WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: "Data tidak ditemukan" });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- UPDATE: Perbarui Nama Sampah atau Gambar ---
app.put('/sampah/:id', authenticateToken, upload.single('pic'), async (req, res) => {
    const { id } = req.params;
    const { nama_sampah } = req.body;
    try {
        // Cek apakah data ada
        const [existing] = await db.execute('SELECT * FROM sampah WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ message: "Data tidak ditemukan" });
        let query = 'UPDATE sampah SET nama_sampah = ?';
        let params = [nama_sampah || existing[0].nama_sampah];
        // Jika ada upload gambar baru
        if (req.file) {
            query += ', pic = ?';
            params.push(req.file.filename);
            // Opsional: Hapus file gambar lama dari folder /uploads
            if (existing[0].pic) {
                const oldPath = path.join(__dirname, 'uploads', existing[0].pic);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        query += ' WHERE id = ?';
        params.push(id);
        await db.execute(query, params);
        res.json({ message: "Data sampah berhasil diperbarui" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE: Hapus Data dan File Gambarnya ---
app.delete('/sampah/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Ambil info gambar sebelum data dihapus dari DB
        const [rows] = await db.execute('SELECT pic FROM sampah WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Data tidak ditemukan" });
        // Hapus file fisik jika ada
        if (rows[0].pic) {
            const filePath = path.join(__dirname, 'uploads', rows[0].pic);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        // Hapus baris di database
        await db.execute('DELETE FROM sampah WHERE id = ?', [id]);
        res.json({ message: "Data sampah dan file gambar berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. JALANKAN SERVER
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});