/* ===================================================
   RoomTab — Atajos de Teclado (Keyboard Shortcuts)
   =================================================== */

(function() {
  var HELP_KEY = 'roomtab-shortcuts-seen';

  function __t(key) {
    var lang = localStorage.getItem('roomtab-lang') || 'es';
    return (window.translations && window.translations[lang] && window.translations[lang][key] !== undefined)
      ? window.translations[lang][key]
      : key;
  }

  function injectShortcutStyles() {
    var styleId = 'roomtab-shortcut-styles';
    if (document.getElementById(styleId)) return;
    var css = document.createElement('style');
    css.id = styleId;
    css.textContent =
      '#roomtab-shortcuts-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:roomtab-fade-in 0.2s ease;}' +
      '#roomtab-shortcuts-modal{background:#fff;color:#1a1a2e;border-radius:16px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-height:85vh;overflow-y:auto;}' +
      '#roomtab-shortcuts-modal h2{margin:0 0 4px 0;font-size:20px;font-weight:700;color:#1a1a2e;}' +
      '#roomtab-shortcuts-modal .shortcuts-desc{margin:0 0 20px 0;font-size:14px;color:#666;}' +
      '#roomtab-shortcuts-modal table{width:100%;border-collapse:collapse;}' +
      '#roomtab-shortcuts-modal th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#999;padding:6px 8px;border-bottom:1px solid #eee;}' +
      '#roomtab-shortcuts-modal td{padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:14px;}' +
      '#roomtab-shortcuts-modal kbd{display:inline-block;padding:3px 10px;font-size:13px;font-weight:600;font-family:inherit;background:#f0f0f0;border:1px solid #ddd;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.06);min-width:28px;text-align:center;}' +
      '#roomtab-shortcuts-modal .shortcuts-actions{margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;}' +
      '#roomtab-shortcuts-modal .shortcuts-btn{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:background 0.2s,transform 0.15s;}' +
      '#roomtab-shortcuts-modal .shortcuts-btn:active{transform:scale(0.96);}' +
      '#roomtab-shortcuts-modal .shortcuts-btn-primary{background:#2d6a4f;color:#fff;}' +
      '#roomtab-shortcuts-modal .shortcuts-btn-primary:hover{background:#1b4332;}' +
      '#roomtab-shortcuts-modal .shortcuts-btn-secondary{background:#e9ecef;color:#333;}' +
      '#roomtab-shortcuts-modal .shortcuts-btn-secondary:hover{background:#dee2e6;}' +
      '@keyframes roomtab-fade-in{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(css);
  }

  function buildShortcutsTable() {
    var t = window.translations && window.translations[localStorage.getItem('roomtab-lang') || 'es'] || {};
    var rows = [
      { key: 'D', label: t.shortcutsDashboard || 'Dashboard' },
      { key: 'M', label: t.shortcutsMinibars || 'Minibars' },
      { key: 'R', label: t.shortcutsQuickReview || 'Quick Review' },
      { key: 'L', label: t.shortcutsLosses || 'Losses' },
      { key: 'P', label: t.shortcutsReports || 'Reports' },
      { key: 'N', label: t.shortcutsNotifications || 'Notifications' },
      { key: '?', label: t.shortcutsHelp || 'Help / Tutorial' },
    ];
    var html = '';
    rows.forEach(function(r) {
      html += '<tr><td><kbd>' + r.key + '</kbd></td><td>' + r.label + '</td></tr>';
    });
    return html;
  }

  function showShortcutsHelp() {
    injectShortcutStyles();
    var t = window.translations && window.translations[localStorage.getItem('roomtab-lang') || 'es'] || {};

    var existing = document.getElementById('roomtab-shortcuts-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'roomtab-shortcuts-overlay';
    overlay.innerHTML =
      '<div id="roomtab-shortcuts-modal">' +
        '<h2>' + (t.shortcutsTitle || 'Keyboard Shortcuts') + '</h2>' +
        '<p class="shortcuts-desc">' + (t.shortcutsDesc || 'Use these keys to navigate quickly:') + '</p>' +
        '<table>' +
          '<thead><tr><th>Tecla</th><th>' + (t.shortcutsAction || 'Acción') + '</th></tr></thead>' +
          '<tbody>' + buildShortcutsTable() + '</tbody>' +
        '</table>' +
        '<div class="shortcuts-actions">' +
          '<button class="shortcuts-btn shortcuts-btn-primary" data-shortcut-action="tutorial">' + (t.shortcutsStartTutorial || 'Start guided tour') + '</button>' +
          '<button class="shortcuts-btn shortcuts-btn-secondary" data-shortcut-action="close">' + (t.close || 'Close') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    try { localStorage.setItem(HELP_KEY, 'true'); } catch(e) {}

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.remove();
        return;
      }
      var btn = e.target.closest('[data-shortcut-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-shortcut-action');
      if (action === 'close') {
        overlay.remove();
      } else if (action === 'tutorial') {
        overlay.remove();
        if (window.startTutorial) window.startTutorial();
      }
    });
  }

  window.showShortcutsHelp = showShortcutsHelp;

  document.addEventListener('keydown', function(e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;

    switch (e.key) {
      case 'd': case 'D':
        if (!e.ctrlKey && !e.metaKey) window.location.href = '/app/panel-de-control';
        break;
      case 'm': case 'M':
        window.location.href = '/app/minibar';
        break;
      case 'r': case 'R':
        window.location.href = '/app/revision-rapida';
        break;
      case 'l': case 'L':
        window.location.href = '/app/perdidas';
        break;
      case 'p': case 'P':
        window.location.href = '/app/reportes';
        break;
      case 'n': case 'N':
        window.location.href = '/app/notificaciones';
        break;
      case '?':
        e.preventDefault();
        showShortcutsHelp();
        break;
      case 'Escape':
        var modal = document.querySelector('.modal-overlay, .modal, #roomtab-shortcuts-overlay');
        if (modal) {
          if (modal.id === 'roomtab-shortcuts-overlay') {
            modal.remove();
          } else {
            modal.click();
          }
        }
        break;
    }
  });
})();
