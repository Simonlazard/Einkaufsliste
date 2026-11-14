/*
 * Foto-Texterkennung für „QR-Code erstellen“.
 * Öffnet eine Kamera mit großem Rahmen; nur der Bereich im Rahmen wird gelesen (Tesseract, Deutsch,
 * läuft komplett auf dem Gerät, die Dateien liegen in lib/tesseract/).
 * Ocr.run() → Promise mit dem erkannten Text oder null (abgebrochen).
 */
(function (root) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const abs = (p) => new URL(p, document.baseURI).href;

  let busy = false;

  function setBusy(on, text) {
    $('#ocr-busy').hidden = !on;
    if (text) $('#ocr-busy-text').textContent = text;
  }

  async function createRecognizer(onStatus) {
    if (!root.Tesseract) throw new Error('Texterkennung nicht geladen');
    const worker = await root.Tesseract.createWorker('deu', 1, {
      workerPath: abs('lib/tesseract/worker.min.js'),
      corePath: abs('lib/tesseract').replace(/\/$/, ''),
      langPath: abs('lib/tesseract').replace(/\/$/, ''),
      gzip: false,
      cacheMethod: 'none',
      logger: (m) => { if (onStatus) onStatus(m); },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: '6',        // ein Textblock, Zeile für Zeile
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    return worker;
  }

  /** Graustufen und Kontrast strecken, Größe in einen guten Bereich bringen. */
  function prepare(video, sx, sy, sw, sh) {
    const k = sw < 1300 ? 1300 / sw : (sw > 2200 ? 2200 / sw : 1);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
      d[i] = g;
      hist[g]++;
    }
    const total = c.width * c.height;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
    const span = Math.max(40, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function run() {
    if (busy) return Promise.resolve(null);
    busy = true;
    const overlay = $('#ocr-overlay');
    const video = $('#ocr-video');
    const frame = $('#ocr-frame');
    let stream = null;
    let worker = null;
    let workerPromise = null;
    let closed = false;

    return new Promise((resolve) => {
      const finish = async (text) => {
        if (closed) return;
        closed = true;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
        overlay.hidden = true;
        setBusy(false);
        document.documentElement.classList.remove('no-scroll');
        $('#ocr-shutter').onclick = null;
        $('#ocr-cancel').onclick = null;
        busy = false;
        try {
          const w = worker || (workerPromise ? await workerPromise.catch(() => null) : null);
          if (w) await w.terminate();
        } catch (e) { /* egal */ }
        resolve(text);
      };

      overlay.hidden = false;
      document.documentElement.classList.add('no-scroll');
      $('#ocr-hint').textContent = 'Zutatenliste in den Rahmen legen';
      $('#ocr-shutter').disabled = true;
      setBusy(true, 'Kamera wird gestartet …');
      $('#ocr-cancel').onclick = () => finish(null);

      // Erkennung schon im Hintergrund laden, während die Kamera startet
      workerPromise = createRecognizer().then((w) => { worker = w; return w; });
      workerPromise.catch(() => { /* wird beim Auslösen gemeldet */ });

      (async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert('Die Kamera ist hier nicht verfügbar.');
          return finish(null);
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
        } catch (e) {
          alert('Kein Kamerazugriff. Bitte in den iPhone-Einstellungen erlauben.');
          return finish(null);
        }
        if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
        try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* nicht überall */ }
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* iOS startet trotzdem */ }
        setBusy(false);
        $('#ocr-shutter').disabled = false;

        $('#ocr-shutter').onclick = async () => {
          if (!video.videoWidth) return;
          $('#ocr-shutter').disabled = true;
          // Ausschnitt im Rahmen berechnen (Video ist mit object-fit: cover dargestellt)
          const vw = video.videoWidth, vh = video.videoHeight;
          const ob = overlay.getBoundingClientRect();
          const W = ob.width, H = ob.height;
          const scale = Math.max(W / vw, H / vh);
          const ox = (vw * scale - W) / 2, oy = (vh * scale - H) / 2;
          const fb = frame.getBoundingClientRect();
          const sx = Math.max(0, (fb.left - ob.left + ox) / scale);
          const sy = Math.max(0, (fb.top - ob.top + oy) / scale);
          const sw = Math.min(vw - sx, fb.width / scale);
          const sh = Math.min(vh - sy, fb.height / scale);
          const canvas = prepare(video, sx, sy, sw, sh);
          video.pause();
          setBusy(true, 'Text wird gelesen …');
          try {
            const w = worker || await workerPromise;
            const { data } = await w.recognize(canvas);
            finish(data.text || '');
          } catch (e) {
            alert('Die Texterkennung ist fehlgeschlagen. ' + (e && e.message ? e.message : ''));
            video.play().catch(() => {});
            setBusy(false);
            $('#ocr-shutter').disabled = false;
          }
        };
      })();
    });
  }

  root.Ocr = { run };
})(window);
