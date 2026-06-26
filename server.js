require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const os = require('os');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const ROOT = path.resolve(process.env.ROOT_PATH);
const PRIVATE_FOLDER = 'privado';

if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

// ---------- SEGURIDAD: evitar path traversal ----------
function safePath(relPath) {
    const full = path.normalize(path.join(ROOT, relPath || ''));
    if (!full.startsWith(ROOT)) return null;
    return full;
}

// ---------- AUTH PRIVADO ----------
app.post('/auth-private', async (req, res) => {
    const { password } = req.body;
    const hash = process.env.PRIVATE_PASSWORD_HASH;
    if (!hash) return res.json({ ok: false });
    const ok = await bcrypt.compare(password || '', hash);
    if (ok) {
        res.cookie('private', 'ok', {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });
    }
    res.json({ ok });
});

app.post('/logout-private', (req, res) => {
    res.clearCookie('private');
    res.json({ ok: true });
});

function isPrivatePath(relPath) {
    const parts = (relPath || '').split(/[\\/]/).filter(Boolean);
    return parts.some(p => p.toLowerCase() === PRIVATE_FOLDER.toLowerCase());
}

function checkPrivateAccess(req, relPath) {
    if (isPrivatePath(relPath)) {
        return req.cookies.private === 'ok';
    }
    return true;
}

// ---------- LISTAR ----------
app.get('/list', (req, res) => {
    const relPath = req.query.path || '';
    if (!checkPrivateAccess(req, relPath)) {
        return res.status(401).json({ private: true });
    }
    const fullPath = safePath(relPath);
    if (!fullPath) return res.status(400).json({ error: 'Ruta inválida' });
    if (!fs.existsSync(fullPath)) return res.json([]);

    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = items.map(i => {
        const itemPath = path.join(fullPath, i.name);
        const stat = fs.statSync(itemPath);
        return {
            name: i.name,
            isDir: i.isDirectory(),
            size: i.isDirectory() ? null : stat.size,
            mtime: stat.mtime
        };
    }).sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    res.json(result);
});

// ---------- DOWNLOAD ----------
app.get('/download', (req, res) => {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).send('Falta ruta');
    if (!checkPrivateAccess(req, relPath)) {
        return res.status(401).send('Acceso denegado');
    }
    const fullPath = safePath(relPath);
    if (!fullPath) return res.status(400).send('Ruta inválida');
    if (!fs.existsSync(fullPath)) return res.status(404).send('No existe');

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return res.status(400).send('Es una carpeta');

    const ext = path.extname(fullPath).toLowerCase();
    const filename = path.basename(fullPath);

    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const inline = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.mp3'].includes(ext);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    // Soporte para range (video/audio streaming)
    const range = req.headers.range;
    if (range && (contentType.startsWith('video') || contentType.startsWith('audio'))) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
        });
        fs.createReadStream(fullPath, { start, end }).pipe(res);
    } else {
        fs.createReadStream(fullPath).pipe(res);
    }
});

// ---------- UPLOAD ----------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const relPath = req.query.path || '';
        if (!checkPrivateAccess(req, relPath)) {
            return cb(new Error('Acceso denegado'));
        }
        const dest = safePath(relPath);
        if (!dest) return cb(new Error('Ruta inválida'));
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // Preservar nombre original con codificación correcta
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 GB
});

app.post('/upload', upload.single('archivo'), (req, res) => {
    if (!req.file) return res.status(400).send('Sin archivo');
    res.json({ name: req.file.filename, size: req.file.size });
});

// ---------- CREAR CARPETA ----------
app.post('/mkdir', (req, res) => {
    const { path: relPath, name } = req.body;
    if (!name || name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
        return res.status(400).json({ error: 'Nombre inválido' });
    }
    if (!checkPrivateAccess(req, relPath)) {
        return res.status(401).json({ error: 'Acceso denegado' });
    }
    const base = safePath(relPath || '');
    if (!base) return res.status(400).json({ error: 'Ruta inválida' });
    const newDir = path.join(base, name);
    if (!newDir.startsWith(ROOT)) return res.status(400).json({ error: 'Ruta inválida' });
    if (fs.existsSync(newDir)) return res.status(409).json({ error: 'Ya existe' });
    fs.mkdirSync(newDir, { recursive: true });
    res.json({ ok: true });
});

// ---------- RENOMBRAR ----------
app.post('/rename', (req, res) => {
    const { path: relPath, newName } = req.body;
    if (!newName || newName.includes('/') || newName.includes('\\')) {
        return res.status(400).json({ error: 'Nombre inválido' });
    }
    if (!checkPrivateAccess(req, relPath)) {
        return res.status(401).json({ error: 'Acceso denegado' });
    }
    const fullPath = safePath(relPath);
    if (!fullPath || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'No existe' });
    const newPath = path.join(path.dirname(fullPath), newName);
    if (!newPath.startsWith(ROOT)) return res.status(400).json({ error: 'Ruta inválida' });
    fs.renameSync(fullPath, newPath);
    res.json({ ok: true });
});

// ---------- DELETE ----------
app.delete('/delete', (req, res) => {
    const relPath = req.query.path;
    if (!checkPrivateAccess(req, relPath)) {
        return res.status(401).send('Acceso denegado');
    }
    const full = safePath(relPath);
    if (!full) return res.status(400).send('Ruta inválida');
    if (!fs.existsSync(full)) return res.status(404).send('No existe');

    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
    } else {
        fs.unlinkSync(full);
    }
    res.sendStatus(200);
});

// ---------- START ----------
app.listen(PORT, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    const localIPs = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Solo IPv4 y no loopback (127.0.0.1)
            if (iface.family === 'IPv4' && !iface.internal) {
                localIPs.push({ name, address: iface.address });
            }
        }
    }

    console.log(`\n🚀 Servidor corriendo en:`);
    console.log(`   → Local:    http://localhost:${PORT}`);
    for (const { name, address } of localIPs) {
        console.log(`   → Red (${name}):  http://${address}:${PORT}`);
    }
    console.log('');
});