/** Pembuat installer Windows (.bat), ikon (.ico), dan shortcut Mac (.webloc). Dijalankan di browser penerima. */
(function (root) {
  var LTI = {};

  LTI.safeName = function (s) {
    return String(s || '').replace(/[\u0000-\u001f\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 50) || 'Aplikasi';
  };

  /** Aman untuk string tunggal PowerShell (termasuk tanda kutip melengkung yang dianggap kutip oleh PowerShell). */
  LTI.psq = function (s) {
    return String(s).replace(/[\r\n]/g, ' ').replace(/['\u2018\u2019\u201A\u201B]/g, function (m) { return m + m; });
  };

  LTI.toB64 = function (bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  /** entries: [{size, bytes(Uint8Array PNG)}] -> Uint8Array berformat ICO (entri PNG). */
  LTI.buildIco = function (entries) {
    var n = entries.length, total = 6 + 16 * n, i;
    entries.forEach(function (e) { total += e.bytes.length; });
    var out = new Uint8Array(total), dv = new DataView(out.buffer), off = 6 + 16 * n;
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, n, true);
    for (i = 0; i < n; i++) {
      var e = entries[i], p = 6 + 16 * i;
      out[p] = e.size >= 256 ? 0 : e.size; out[p + 1] = e.size >= 256 ? 0 : e.size; out[p + 2] = 0; out[p + 3] = 0;
      dv.setUint16(p + 4, 1, true); dv.setUint16(p + 6, 32, true);
      dv.setUint32(p + 8, e.bytes.length, true); dv.setUint32(p + 12, off, true);
      out.set(e.bytes, off); off += e.bytes.length;
    }
    return out;
  };

  /** o: {name, id, url, icoB64}. Seluruh isi file terbaca; yang dijalankan hanya blok antara penanda di akhir file. */
  LTI.buildBat = function (o) {
    var ps = [
      "$ErrorActionPreference='Stop'",
      'try {',
      "$name='" + LTI.psq(LTI.safeName(o.name)) + "'; $id='" + LTI.psq(o.id) + "'; $url='" + LTI.psq(o.url) + "'",
      "$dir=Join-Path $env:LOCALAPPDATA 'LinkToIcon'",
      'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
      "$ico=Join-Path $dir ($id+'.ico')",
      "[IO.File]::WriteAllBytes($ico,[Convert]::FromBase64String('" + o.icoB64 + "'))",
      "$lnk=Join-Path ([Environment]::GetFolderPath('Desktop')) ($name+'.url')",
      "$txt='[InternetShortcut]'+\"`r`n\"+'URL='+$url+\"`r`n\"+'IconFile='+$ico+\"`r`n\"+'IconIndex=0'+\"`r`n\"",
      '[IO.File]::WriteAllText($lnk,$txt,[Text.Encoding]::Default)',
      "Write-Host ('Pintasan dibuat: '+$lnk)",
      "} catch { Write-Host ('Kesalahan: '+$_.Exception.Message); exit 1 }"
    ].join('\r\n');
    var L = [
      '@echo off', 'setlocal', 'title Pasang ikon aplikasi',
      'rem Installer ikon, ID aplikasi: ' + String(o.id).replace(/[^A-Za-z0-9-]/g, ''),
      'echo ============================================',
      'echo  Pemasangan ikon aplikasi ' + String(o.id).replace(/[^A-Za-z0-9-]/g, ''),
      'echo ============================================',
      'echo.',
      'echo Skrip ini hanya melakukan dua hal:',
      'echo  1. Menyimpan satu file ikon di folder %%LOCALAPPDATA%%\\LinkToIcon',
      'echo  2. Membuat satu pintasan di Desktop Anda yang membuka aplikasi di browser',
      'echo.',
      'echo Tidak memerlukan hak Administrator, tidak mengubah registry atau pengaturan Windows,',
      'echo dan tidak mengirim data apa pun. Seluruh isi file ini dapat dibaca dengan Notepad.',
      'echo.',
      'echo Tekan tombol apa saja untuk melanjutkan, atau tutup jendela ini untuk membatalkan.',
      'pause >nul',
      'powershell -NoProfile -Command "$t=[IO.File]::ReadAllText(\'%~f0\',[Text.Encoding]::UTF8); $m=[regex]::Match($t,\'(?s)<#[P]S(.*?)[P]S#>\'); if(-not $m.Success){exit 1}; Invoke-Expression $m.Groups[1].Value"',
      'if errorlevel 1 goto gagal',
      'echo.', 'echo Selesai. Cari ikon aplikasi di Desktop Anda.', 'pause', 'exit /b 0',
      ':gagal', 'echo.', 'echo Pemasangan gagal. Ikon tidak dibuat.', 'pause', 'exit /b 1',
      '<#PS', ps, 'PS#>', ''
    ];
    return L.join('\r\n');
  };

  LTI.buildWebloc = function (url) {
    var x = String(url).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>' + x + '</string></dict></plist>\n';
  };

  /** Browser saja: PNG base64 -> ICO (256,128,64,48,32,16) dengan bentuk sesuai pilihan admin. */
  LTI.makeIco = function (b64, style) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onerror = function () { reject(new Error('Gambar ikon tidak dapat dibaca.')); };
      img.onload = function () {
        var sizes = [256, 128, 64, 48, 32, 16], out = [];
        (function next(i) {
          if (i === sizes.length) return resolve(LTI.buildIco(out));
          var s = sizes[i], c = document.createElement('canvas'); c.width = c.height = s;
          var x = c.getContext('2d'); x.beginPath();
          if (style === 'circle') x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
          else if (style === 'rounded') { var r = s * 0.18; x.moveTo(r, 0); x.arcTo(s, 0, s, s, r); x.arcTo(s, s, 0, s, r); x.arcTo(0, s, 0, 0, r); x.arcTo(0, 0, s, 0, r); }
          else x.rect(0, 0, s, s);
          x.closePath(); x.clip(); x.drawImage(img, 0, 0, s, s);
          c.toBlob(function (blob) {
            if (!blob) return reject(new Error('Gagal membuat ikon.'));
            blob.arrayBuffer().then(function (ab) { out.push({ size: s, bytes: new Uint8Array(ab) }); next(i + 1); }, reject);
          }, 'image/png');
        })(0);
      };
      img.src = 'data:image/png;base64,' + b64;
    });
  };

  LTI.download = function (data, name, type) {
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob([data], { type: type || 'application/octet-stream' }));
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LTI; else root.LTI = LTI;
})(this);
