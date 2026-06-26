// ---- ESTADO ----
let currentPath = '';
let currentView = localStorage.getItem('view') || 'grid';
let dragCounter = 0;

const grid = document.getElementById('grid');
const uploadProgress = document.getElementById('uploadProgress');
const emptyState = document.getElementById('emptyState');
const listHeader = document.getElementById('listHeader');
const dragOverlay = document.getElementById('dragOverlay');

// ---- INIT ----
setView(currentView, false);
load('');

// ---- HELPERS ----
function joinPath(...parts) {
    return parts.filter(Boolean).join('/');
}

function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(mtime) {
    if (!mtime) return '';
    const d = new Date(mtime);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileIcon(name, isDir) {
    if (isDir) return '📁';
    const ext = name.split('.').pop().toLowerCase();
    const map = {
        jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
        mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
        mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵', m4a: '🎵',
        pdf: '📄',
        zip: '🗜', rar: '🗜', '7z': '🗜', tar: '🗜', gz: '🗜',
        doc: '📝', docx: '📝',
        xls: '📊', xlsx: '📊',
        ppt: '📊', pptx: '📊',
        txt: '📃', md: '📃', log: '📃', csv: '📃',
        js: '⚙', ts: '⚙', py: '⚙', sh: '⚙', json: '⚙', html: '⚙', css: '⚙',
        exe: '⚙', msi: '⚙',
    };
    return map[ext] || '📄';
}

function getFileType(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (/^(jpg|jpeg|png|gif|webp|svg)$/.test(ext)) return 'image';
    if (/^(mp4|webm|mov|avi|mkv)$/.test(ext)) return 'video';
    if (/^(mp3|wav|ogg|flac|m4a)$/.test(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (/^(txt|md|log|js|ts|py|sh|json|html|css|csv|xml|yaml|yml|ini|env)$/.test(ext)) return 'text';
    return 'other';
}

function isPrivatePath(p) {
    return (p || '').split('/').some(s => s.toLowerCase() === 'privado');
}

function downloadUrl(relPath) {
    return '/download?path=' + encodeURIComponent(relPath);
}

function escAttr(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ---- TOAST ----
let toastTimer;
function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3000);
}

// ---- VIEW ----
function setView(v, save = true) {
    currentView = v;
    if (save) localStorage.setItem('view', v);
    grid.className = 'view-' + v;
    document.getElementById('btnGrid').classList.toggle('active', v === 'grid');
    document.getElementById('btnList').classList.toggle('active', v === 'list');
    listHeader.style.display = v === 'list' ? 'grid' : 'none';
    renderItems(window._lastItems || [], currentPath);
}

// ---- CARGA ----
async function load(path) {
    // Zona privada: siempre cerrar sesión anterior y pedir contraseña
    if (isPrivatePath(path)) {
        await logoutPrivate();
        currentPath = path;
        renderBreadcrumbs();
        document.getElementById('privatePass').value = '';
        document.getElementById('authError').style.display = 'none';
        openModal('modalAuth');
        return;
    }

    currentPath = path;
    renderBreadcrumbs();

    try {
        const res = await fetch('/list?path=' + encodeURIComponent(path));
        if (res.status === 401) {
            const data = await res.json().catch(() => ({}));
            if (data.private) { openModal('modalAuth'); return; }
        }
        if (!res.ok) throw new Error('Error ' + res.status);
        const items = await res.json();
        window._lastItems = items;
        renderItems(items, path);
    } catch (e) {
        showToast('Error cargando carpeta', 'error');
    }
}

// Carga directa sin disparar flujo de auth (post-login)
async function loadAfterAuth(path) {
    currentPath = path;
    renderBreadcrumbs();
    try {
        const res = await fetch('/list?path=' + encodeURIComponent(path));
        if (!res.ok) throw new Error();
        const items = await res.json();
        window._lastItems = items;
        renderItems(items, path);
    } catch {
        showToast('Error cargando carpeta', 'error');
    }
}

// ---- RENDER ----
function renderItems(items, path) {
    grid.innerHTML = '';
    if (!items || !items.length) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    items.forEach(item => {
        const itemPath = joinPath(path, item.name);
        const el = currentView === 'grid'
            ? renderGridItem(item, itemPath)
            : renderListItem(item, itemPath);
        grid.appendChild(el);
    });
}

function renderGridItem(item, itemPath) {
    const el = document.createElement('div');
    el.className = 'item-grid';
    const type = item.isDir ? 'dir' : getFileType(item.name);

    const previewHtml = (type === 'image')
        ? `<img class="item-preview" src="${downloadUrl(itemPath)}" alt="${escAttr(item.name)}" loading="lazy">`
        : `<div class="item-icon">${fileIcon(item.name, item.isDir)}</div>`;

    const actionsHtml = item.isDir
        ? `<div class="item-actions-grid">
            <span class="action-icon" title="Eliminar carpeta" onclick="event.stopPropagation();deleteItem('${escAttr(itemPath)}',true)">✕</span>
           </div>`
        : `<div class="item-actions-grid">
            <span class="action-icon" title="Vista previa" onclick="event.stopPropagation();openPreview('${escAttr(itemPath)}','${escAttr(item.name)}')">👁</span>
            <a href="${downloadUrl(itemPath)}" class="action-icon" download="${escAttr(item.name)}" title="Descargar" onclick="event.stopPropagation()">⬇</a>
            <span class="action-icon" title="Eliminar" onclick="event.stopPropagation();deleteItem('${escAttr(itemPath)}',false)">✕</span>
           </div>`;

    el.innerHTML = `
        ${previewHtml}
        <div class="item-name" title="${escAttr(item.name)}">${item.name}</div>
        <div class="item-meta">${item.isDir ? 'Carpeta' : formatSize(item.size)}</div>
        ${actionsHtml}
    `;

    if (item.isDir) {
        el.onclick = () => load(itemPath);
    } else {
        el.onclick = () => openPreview(itemPath, item.name);
    }
    return el;
}

function renderListItem(item, itemPath) {
    const el = document.createElement('div');
    el.className = 'item-list';

    el.innerHTML = `
        <div class="list-icon">${fileIcon(item.name, item.isDir)}</div>
        <div class="list-name" title="${escAttr(item.name)}">${item.name}</div>
        <div class="list-size">${item.isDir ? '—' : formatSize(item.size)}</div>
        <div class="list-date">${formatDate(item.mtime)}</div>
        <div class="list-actions">
            ${!item.isDir ? `
                <button class="btn" style="padding:4px 10px;font-size:11px"
                    onclick="event.stopPropagation();openPreview('${escAttr(itemPath)}','${escAttr(item.name)}')">👁</button>
                <a href="${downloadUrl(itemPath)}" class="btn" style="padding:4px 10px;font-size:11px"
                    download="${escAttr(item.name)}" onclick="event.stopPropagation()">⬇</a>
            ` : ''}
            <button class="btn btn-danger" style="padding:4px 10px;font-size:11px"
                onclick="event.stopPropagation();deleteItem('${escAttr(itemPath)}',${item.isDir})">✕</button>
        </div>
    `;

    if (item.isDir) {
        el.onclick = () => load(itemPath);
    } else {
        el.onclick = () => openPreview(itemPath, item.name);
    }
    return el;
}

// ---- BREADCRUMBS ----
function renderBreadcrumbs() {
    const div = document.getElementById('breadcrumbs');
    const parts = currentPath.split('/').filter(Boolean);
    let html = `<span class="crumb ${parts.length === 0 ? 'active' : ''}" onclick="load('')">raíz</span>`;
    let built = '';
    parts.forEach((p, i) => {
        built += (built ? '/' : '') + p;
        const snap = built;
        const isLast = i === parts.length - 1;
        html += `<span class="crumb-sep">/</span>
                 <span class="crumb ${isLast ? 'active' : ''}" onclick="load('${snap}')">${p}</span>`;
    });
    div.innerHTML = html;
}

// ---- PREVIEW ----
let previewItems = [];
let previewIndex = 0;

function openPreview(filePath, name) {
    // Construir lista navegable con archivos del directorio actual
    previewItems = (window._lastItems || [])
        .filter(i => !i.isDir)
        .map(i => ({ name: i.name, path: joinPath(currentPath, i.name) }));
    previewIndex = previewItems.findIndex(i => i.path === filePath);
    if (previewIndex < 0) previewIndex = 0;

    _renderPreview(filePath, name);
    openModal('modalPreview');
}

function _renderPreview(filePath, name) {
    const type = getFileType(name);
    const url = downloadUrl(filePath);

    document.getElementById('previewTitle').textContent = name;
    const dlBtn = document.getElementById('previewDownload');
    dlBtn.href = url;
    dlBtn.download = name;

    const total = previewItems.length;
    const nav = document.getElementById('previewNav');
    nav.style.display = total > 1 ? 'flex' : 'none';
    document.getElementById('previewCounter').textContent = total > 1 ? `${previewIndex + 1} / ${total}` : '';

    const body = document.getElementById('previewBody');
    body.innerHTML = '';

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'max-width:100%;max-height:75vh;object-fit:contain;border-radius:6px;display:block;margin:auto';
        body.appendChild(img);

    } else if (type === 'video') {
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = true;
        vid.style.cssText = 'width:100%;max-height:72vh;border-radius:6px;background:#000;display:block';
        body.appendChild(vid);

    } else if (type === 'audio') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;padding:30px 0';
        wrap.innerHTML = `<div style="font-size:72px">🎵</div>
            <div style="font-size:13px;color:var(--muted);text-align:center;word-break:break-all">${name}</div>`;
        const aud = document.createElement('audio');
        aud.src = url;
        aud.controls = true;
        aud.style.cssText = 'width:100%;max-width:420px';
        wrap.appendChild(aud);
        body.appendChild(wrap);

    } else if (type === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = url + '#toolbar=1&navpanes=0';
        iframe.style.cssText = 'width:100%;height:72vh;border:none;border-radius:6px;background:#fff';
        body.appendChild(iframe);

    } else if (type === 'text') {
        const pre = document.createElement('pre');
        pre.style.cssText = [
            'background:var(--surface2)', 'border:1px solid var(--border)', 'border-radius:6px',
            'padding:16px', 'overflow:auto', 'max-height:68vh', 'font-size:12px',
            'color:var(--text)', 'white-space:pre-wrap', 'word-break:break-word',
            "font-family:'JetBrains Mono',monospace", 'line-height:1.6'
        ].join(';');
        pre.textContent = 'Cargando…';
        body.appendChild(pre);
        fetch(url)
            .then(r => {
                if (!r.ok) throw new Error();
                return r.text();
            })
            .then(t => { pre.textContent = t; })
            .catch(() => { pre.textContent = 'No se pudo cargar el archivo.'; });

    } else {
        body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:48px 0;color:var(--muted)">
                <div style="font-size:56px">${fileIcon(name, false)}</div>
                <div style="font-size:14px">Sin vista previa para este tipo de archivo</div>
                <a href="${url}" download="${escAttr(name)}" class="btn btn-primary" style="text-decoration:none">⬇ Descargar</a>
            </div>`;
    }
}

function previewNav(dir) {
    if (!previewItems.length) return;
    // Pausar media actual
    document.querySelectorAll('#previewBody video, #previewBody audio').forEach(m => m.pause());
    previewIndex = (previewIndex + dir + previewItems.length) % previewItems.length;
    const item = previewItems[previewIndex];
    _renderPreview(item.path, item.name);
}

function closePreview() {
    document.querySelectorAll('#previewBody video, #previewBody audio').forEach(m => m.pause());
    closeModal('modalPreview');
}

// ---- AUTH ----
function goPrivate() { load('privado'); }

async function logoutPrivate() {
    await fetch('/logout-private', { method: 'POST' }).catch(() => {});
}

async function unlockPrivate() {
    const password = document.getElementById('privatePass').value;
    const errEl = document.getElementById('authError');
    errEl.style.display = 'none';

    const res = await fetch('/auth-private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.ok) {
        document.getElementById('privatePass').value = '';
        closeModal('modalAuth');
        await loadAfterAuth(currentPath || 'privado');
        showToast('Acceso concedido', 'success');
    } else {
        errEl.style.display = 'block';
        document.getElementById('privatePass').select();
    }
}

// ---- MODAL ----
function openModal(id) {
    document.getElementById(id).classList.add('open');
    const input = document.querySelector(`#${id} input`);
    if (input) setTimeout(() => input.focus(), 50);
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
        if (e.target !== m) return;
        if (m.id === 'modalPreview') closePreview();
        else if (m.id !== 'modalAuth') closeModal(m.id); // auth no cierra con click fuera
    });
});

// ---- CREAR CARPETA ----
function openMkdir() {
    document.getElementById('mkdirName').value = '';
    document.getElementById('mkdirError').style.display = 'none';
    openModal('modalMkdir');
}

async function createFolder() {
    const name = document.getElementById('mkdirName').value.trim();
    const errEl = document.getElementById('mkdirError');
    errEl.style.display = 'none';
    if (!name) { errEl.textContent = 'Escribe un nombre'; errEl.style.display = 'block'; return; }

    const res = await fetch('/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name })
    });
    if (res.ok) {
        closeModal('modalMkdir');
        showToast('Carpeta creada', 'success');
        load(currentPath);
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = data.error || 'Error al crear';
        errEl.style.display = 'block';
    }
}

// ---- DELETE ----
async function deleteItem(relPath, isDir) {
    const name = relPath.split('/').pop();
    const msg = isDir ? `¿Eliminar la carpeta "${name}" y todo su contenido?` : `¿Eliminar "${name}"?`;
    if (!confirm(msg)) return;

    const res = await fetch('/delete?path=' + encodeURIComponent(relPath), { method: 'DELETE' });
    if (res.ok) {
        showToast('Eliminado', 'success');
        load(currentPath);
    } else {
        showToast('Error al eliminar', 'error');
    }
}

// ---- UPLOAD ----
function upload(file) {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML = `
        <span class="progress-status">⬆</span>
        <span class="progress-name">${file.name}</span>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>
        <span class="progress-pct">0%</span>
    `;
    uploadProgress.style.display = 'flex';
    uploadProgress.appendChild(item);

    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('archivo', file);

    xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
            const pct = Math.round(e.loaded / e.total * 100);
            item.querySelector('.progress-bar').style.width = pct + '%';
            item.querySelector('.progress-pct').textContent = pct + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            item.querySelector('.progress-status').textContent = '✅';
            item.querySelector('.progress-pct').textContent = '100%';
            item.querySelector('.progress-bar').style.width = '100%';
            setTimeout(() => {
                item.remove();
                if (!uploadProgress.children.length) uploadProgress.style.display = 'none';
            }, 1500);
            load(currentPath);
        } else {
            item.querySelector('.progress-status').textContent = '❌';
            showToast('Error subiendo ' + file.name, 'error');
        }
    };

    xhr.onerror = () => {
        item.querySelector('.progress-status').textContent = '❌';
        showToast('Error de red', 'error');
    };

    xhr.open('POST', '/upload?path=' + encodeURIComponent(currentPath));
    xhr.send(form);
}

document.getElementById('fileInput').addEventListener('change', e => {
    [...e.target.files].forEach(upload);
    e.target.value = '';
});

document.getElementById('uploadZone').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

// ---- DRAG & DROP ----
window.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dragOverlay.classList.add('visible');
});
window.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; dragOverlay.classList.remove('visible'); }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('visible');
    [...e.dataTransfer.files].forEach(upload);
});

// ---- KEYBOARD ----
document.addEventListener('keydown', e => {
    const previewOpen = document.getElementById('modalPreview').classList.contains('open');
    if (e.key === 'Escape') {
        if (previewOpen) closePreview();
        else document.querySelectorAll('.modal-overlay.open').forEach(m => {
            if (m.id !== 'modalAuth') closeModal(m.id);
        });
    }
    if (previewOpen) {
        if (e.key === 'ArrowLeft')  previewNav(-1);
        if (e.key === 'ArrowRight') previewNav(1);
    }
});