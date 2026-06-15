(function () {
  var el = null;

  function ensure() {
    if (!el) {
      el = document.getElementById("app-loader");
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "app-loader";
      el.innerHTML =
        '<div class="loader-content">' +
          '<img src="/images/roomtab-logo-white.png" alt="RoomTab" class="loader-logo">' +
          '<div class="loader-spinner"></div>' +
          '<p class="loader-text">Cargando...</p>' +
        '</div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function setText(text) {
    var e = ensure();
    var p = e.querySelector(".loader-text");
    if (p) p.textContent = text;
  }

  window.Loader = {
    show: function () {
      var e = ensure();
      e.classList.add("visible");
    },
    hide: function () {
      var e = ensure();
      e.classList.remove("visible");
    },
    isVisible: function () {
      return el && el.classList.contains("visible");
    }
  };

  window.Preloader = {
    show: function (text) {
      var e = ensure();
      if (text) {
        var p = e.querySelector(".loader-text");
        if (p) p.textContent = text;
      }
      e.classList.add("visible");
    },
    hide: function () {
      var e = ensure();
      e.classList.remove("visible");
    }
  };
})();
