/* ===================================================
   RoomTab — Tutorial Interactivo (Interactive Tour)
   =================================================== */

var tutorialSteps = [
  { selector: '.sidebar', title: 'Navegación', text: 'Usa el menú lateral para acceder a todas las secciones de la aplicación.', position: 'right' },
  { selector: '.dash-kpi-grid', title: 'Indicadores clave', text: 'Aquí ves los KPIs más importantes del minibar: consumos, pérdidas, stock y más.', position: 'bottom' },
  { selector: '#dash-filters', title: 'Filtros', text: 'Filtra los datos por hoy, esta semana o este mes.', position: 'bottom' },
  { selector: '.dash-charts-grid', title: 'Gráficos', text: 'Visualiza tendencias de consumo, distribución por piso y categorías.', position: 'top' },
  { selector: '#nav-notifications', title: 'Notificaciones', text: 'Recibe alertas de productos próximos a vencer y eventos importantes.', position: 'left' },
];

function __t(key) {
  var lang = localStorage.getItem('roomtab-lang') || 'es';
  return (window.translations && window.translations[lang] && window.translations[lang][key] !== undefined)
    ? window.translations[lang][key]
    : key;
}

(function() {
  var TUTORIAL_DONE_KEY = 'roomtab-tutorial-done';

  function injectTutorialStyles() {
    var styleId = 'roomtab-tutorial-styles';
    if (document.getElementById(styleId)) return;
    var css = document.createElement('style');
    css.id = styleId;
    css.textContent =
      '#roomtab-tut-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9998;background:rgba(0,0,0,0.45);transition:opacity 0.3s ease;}' +
      '#roomtab-tut-highlight{position:fixed;z-index:9999;border-radius:6px;box-shadow:0 0 0 4px rgba(255,255,255,0.7),0 0 0 9999px rgba(0,0,0,0.45);transition:all 0.35s cubic-bezier(0.4,0,0.2,1);pointer-events:none;}' +
      '#roomtab-tut-tooltip{position:fixed;z-index:10000;background:var(--color-card,#fff);color:var(--color-text,#1a1a2e);border-radius:var(--radius-md,12px);padding:20px 24px;max-width:360px;box-shadow:var(--shadow-card,0 12px 40px rgba(0,0,0,0.25));transition:opacity 0.3s ease,transform 0.3s ease;font-family:var(--font-text),-apple-system,sans-serif;}' +
      '#roomtab-tut-tooltip .tut-step-indicator{font-size:12px;color:var(--color-muted,#888);margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;}' +
      '#roomtab-tut-tooltip .tut-title{margin:0 0 8px 0;font-size:16px;font-weight:700;color:var(--color-heading,#1a1a2e);font-family:var(--font-title),-apple-system,sans-serif;}' +
      '#roomtab-tut-tooltip .tut-text{margin:0 0 16px 0;font-size:14px;line-height:1.6;color:var(--color-muted,#555);}' +
      '#roomtab-tut-tooltip .tut-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '#roomtab-tut-tooltip .tut-btn{padding:8px 16px;border:none;border-radius:50px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.2s,transform 0.15s;font-family:var(--font-text),-apple-system,sans-serif;}' +
      '#roomtab-tut-tooltip .tut-btn:active{transform:scale(0.96);}' +
      '#roomtab-tut-tooltip .tut-btn-primary{background:var(--color-primary,#2d6a4f);color:#fff;}' +
      '#roomtab-tut-tooltip .tut-btn-primary:hover{background:var(--color-primary-dark,#1b4332);}' +
      '#roomtab-tut-tooltip .tut-btn-secondary{background:var(--color-bg-alt,#e9ecef);color:var(--color-text,#333);}' +
      '#roomtab-tut-tooltip .tut-btn-secondary:hover{background:var(--color-border-soft,#dee2e6);}' +
      '#roomtab-tut-tooltip .tut-btn-skip{background:transparent;color:var(--color-muted,#999);margin-left:auto;padding:8px 12px;}' +
      '#roomtab-tut-tooltip .tut-btn-skip:hover{color:var(--color-text,#666);}' +
      '#roomtab-tut-tooltip.tut-enter{opacity:0;transform:translateY(12px);}' +
      '#roomtab-tut-tooltip.tut-enter-active{opacity:1;transform:translateY(0);}';
    document.head.appendChild(css);
  }

  var currentStep = 0;
  var overlay = null;
  var highlight = null;
  var tooltip = null;
  var active = false;

  function buildTooltipContent(stepIndex) {
    var lang = localStorage.getItem('roomtab-lang') || 'es';
    var t = window.translations && window.translations[lang] ? window.translations[lang] : {};
    var total = tutorialSteps.length;
    var step = tutorialSteps[stepIndex];

    var stepLabel = (t.tutorialStep || 'Paso') + ' ' + (stepIndex + 1) + ' ' + (t.tutorialOf || 'de') + ' ' + total;

    var content = '<div class="tut-step-indicator">' + stepLabel + '</div>';
    content += '<h3 class="tut-title">' + step.title + '</h3>';
    content += '<p class="tut-text">' + step.text + '</p>';
    content += '<div class="tut-buttons">';

    if (stepIndex > 0) {
      content += '<button class="tut-btn tut-btn-secondary" data-tut-action="prev">' + (t.tutorialPrev || '← Anterior') + '</button>';
    }

    if (stepIndex < total - 1) {
      content += '<button class="tut-btn tut-btn-primary" data-tut-action="next">' + (t.tutorialNext || 'Siguiente →') + '</button>';
    } else {
      content += '<button class="tut-btn tut-btn-primary" data-tut-action="finish">' + (t.tutorialFinish || 'Finalizar') + '</button>';
    }

    content += '<button class="tut-btn tut-btn-skip" data-tut-action="skip">' + (t.tutorialSkip || 'Omitir') + '</button>';
    content += '</div>';

    return content;
  }

  function getElementRect(selector) {
    var el = document.querySelector(selector);
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    return rect;
  }

  function positionHighlight(rect) {
    if (!highlight) return;
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  function positionTooltip(rect, position) {
    if (!tooltip) return;
    var tipW = 360;
    var tipH = tooltip.offsetHeight || 220;
    var gap = 12;
    var left, top;

    switch (position) {
      case 'right':
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tipH / 2;
        break;
      case 'left':
        left = rect.left - tipW - gap;
        top = rect.top + rect.height / 2 - tipH / 2;
        break;
      case 'top':
        left = rect.left + rect.width / 2 - tipW / 2;
        top = rect.top - tipH - gap;
        break;
      case 'bottom':
      default:
        left = rect.left + rect.width / 2 - tipW / 2;
        top = rect.bottom + gap;
        break;
    }

    left = Math.max(gap, Math.min(left, window.innerWidth - tipW - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - tipH - gap));

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function renderStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= tutorialSteps.length) {
      cleanup();
      return;
    }
    currentStep = stepIndex;
    var step = tutorialSteps[stepIndex];
    var rect = getElementRect(step.selector);

    if (!rect) {
      cleanup();
      return;
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'roomtab-tut-overlay';
      document.body.appendChild(overlay);
    }

    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = 'roomtab-tut-highlight';
      document.body.appendChild(highlight);
    }

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'roomtab-tut-tooltip';
      tooltip.classList.add('tut-enter');
      document.body.appendChild(tooltip);
      requestAnimationFrame(function() {
        tooltip.classList.remove('tut-enter');
        tooltip.classList.add('tut-enter-active');
      });
    } else {
      tooltip.classList.add('tut-enter');
      tooltip.classList.remove('tut-enter-active');
      requestAnimationFrame(function() {
        tooltip.classList.remove('tut-enter');
        tooltip.classList.add('tut-enter-active');
      });
    }

    positionHighlight(rect);
    tooltip.innerHTML = buildTooltipContent(stepIndex);
    positionTooltip(rect, step.position);
  }

  function handleTooltipClick(e) {
    var btn = e.target.closest('[data-tut-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-tut-action');
    switch (action) {
      case 'next':
        renderStep(currentStep + 1);
        break;
      case 'prev':
        renderStep(currentStep - 1);
        break;
      case 'finish':
        finishTutorial();
        break;
      case 'skip':
        try { sessionStorage.setItem(TUTORIAL_SESSION_KEY, 'true'); } catch(e) {}
        cleanup();
        break;
    }
  }

  function finishTutorial() {
    try { localStorage.setItem(TUTORIAL_DONE_KEY, 'true'); } catch(e) {}
    cleanup();
  }

  function cleanup() {
    active = false;
    if (overlay) { overlay.remove(); overlay = null; }
    if (highlight) { highlight.remove(); highlight = null; }
    if (tooltip) { tooltip.remove(); tooltip = null; }
    currentStep = 0;
  }

  function startTutorial() {
    if (active) {
      cleanup();
      return;
    }
    active = true;
    injectTutorialStyles();
    renderStep(0);
  }

  window.startTutorial = startTutorial;

  document.addEventListener('click', function(e) {
    if (!active) return;
    if (tooltip && tooltip.contains(e.target)) {
      handleTooltipClick(e);
    } else if (overlay && (e.target === overlay || e.target === highlight)) {
      // clicking outside tooltip does nothing
    }
  });

  document.addEventListener('keydown', function(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      cleanup();
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentStep < tutorialSteps.length - 1) renderStep(currentStep + 1);
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentStep > 0) renderStep(currentStep - 1);
    }
  });

  var TUTORIAL_SESSION_KEY = 'roomtab-tutorial-session-shown';

  function autoStart() {
    var done = false;
    var sessionShown = false;
    try { done = localStorage.getItem(TUTORIAL_DONE_KEY) === 'true'; } catch(e) {}
    try { sessionShown = sessionStorage.getItem(TUTORIAL_SESSION_KEY) === 'true'; } catch(e) {}
    if (!done && !sessionShown) {
      try { sessionStorage.setItem(TUTORIAL_SESSION_KEY, 'true'); } catch(e) {}
      setTimeout(function() {
        startTutorial();
      }, 800);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    autoStart();
  } else {
    document.addEventListener('DOMContentLoaded', autoStart);
  }
})();
