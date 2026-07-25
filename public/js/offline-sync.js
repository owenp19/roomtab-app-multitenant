/* =========================
   RoomTab - Offline Sync Engine
   IndexedDB queue for offline operations
   ========================= */

var OfflineSync = (function () {
  'use strict';

  var DB_NAME = 'roomtab_offline';
  var DB_VERSION = 1;
  var STORE_NAME = 'operations';
  var db = null;
  var isSyncing = false;
  var _tenantConfig = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var idb = e.target.result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) {
          var store = idb.createObjectStore(STORE_NAME, { keyPath: 'offlineId', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function addOperation(op) {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var record = {
          type: op.type,
          roomId: op.roomId,
          items: op.items,
          userId: op.userId || null,
          userName: op.userName || 'Operador',
          status: 'pending',
          createdAt: new Date().toISOString(),
          syncedAt: null,
          error: null
        };
        var req = store.add(record);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function getPendingOperations() {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var idx = store.index('status');
        var req = idx.getAll('pending');
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function getPendingCount() {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var idx = store.index('status');
        var req = idx.count('pending');
        req.onsuccess = function () { resolve(req.result || 0); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function markSynced(offlineId) {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req = store.get(offlineId);
        req.onsuccess = function () {
          var record = req.result;
          if (record) {
            record.status = 'synced';
            record.syncedAt = new Date().toISOString();
            store.put(record);
          }
          resolve();
        };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function markFailed(offlineId, error) {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req = store.get(offlineId);
        req.onsuccess = function () {
          var record = req.result;
          if (record) {
            record.status = 'failed';
            record.error = error;
            store.put(record);
          }
          resolve();
        };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function removeSynced() {
    return openDB().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var idx = store.index('status');
        var req = idx.openCursor('synced');
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function syncPending() {
    if (isSyncing) return Promise.resolve({ synced: 0, failed: 0 });
    isSyncing = true;

    return getPendingOperations().then(function (ops) {
      if (ops.length === 0) {
        isSyncing = false;
        return { synced: 0, failed: 0 };
      }

      var payload = ops.map(function (op) {
        return {
          type: op.type,
          roomId: op.roomId,
          items: op.items,
          offlineId: op.offlineId
        };
      });

      return fetch('/api/minibar/sync-offline', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: payload })
      }).then(function (res) { return res.json(); }).then(function (data) {
        if (!data.success) throw new Error(data.error || 'Sync failed');

        var results = data.results || [];
        var synced = 0;
        var failed = 0;

        var chain = Promise.resolve();
        results.forEach(function (r) {
          chain = chain.then(function () {
            if (r.status === 'synced') {
              synced++;
              return markSynced(r.offlineId);
            } else {
              failed++;
              return markFailed(r.offlineId, r.error);
            }
          });
        });

        return chain.then(function () {
          removeSynced();
          isSyncing = false;
          updateBadge();
          notifyClients({ type: 'SYNC_COMPLETE', synced: synced, failed: failed });
          return { synced: synced, failed: failed };
        });
      }).catch(function (err) {
        isSyncing = false;
        notifyClients({ type: 'SYNC_ERROR', error: err.message });
        return { synced: 0, failed: ops.length, error: err.message };
      });
    }).catch(function () {
      isSyncing = false;
      return { synced: 0, failed: 0 };
    });
  }

  function notifyClients(msg) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
    if (typeof BroadcastChannel !== 'undefined') {
      var bc = new BroadcastChannel('roomtab_sync');
      bc.postMessage(msg);
      bc.close();
    }
  }

  function updateBadge() {
    getPendingCount().then(function (count) {
      notifyClients({ type: 'SYNC_BADGE', count: count });
    });
  }

  function isOfflineMode() {
    return _tenantConfig && _tenantConfig.offlineMode;
  }

  function setTenantConfig(config) {
    _tenantConfig = config;
  }

  function interceptFetch() {
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      opts = opts || {};
      var method = (opts.method || 'GET').toUpperCase();

      if (isOfflineMode() && (method === 'POST' || method === 'PUT')) {
        var pathname = '';
        try { pathname = new URL(url, window.location.origin).pathname; } catch (e) {}

        if (pathname.indexOf('/api/minibar/consumption') !== -1 ||
            pathname.indexOf('/api/minibar/restock') !== -1 ||
            pathname.indexOf('/api/minibar/adjust') !== -1) {
          try {
            var body = opts.body ? JSON.parse(opts.body) : {};
            var type = 'consumption';
            if (pathname.indexOf('/restock') !== -1) type = 'restock';
            if (pathname.indexOf('/adjust') !== -1) type = 'adjustment';

            return addOperation({
              type: type,
              roomId: body.roomId,
              items: body.items || []
            }).then(function (offlineId) {
              updateBadge();
              return Promise.resolve(new Response(JSON.stringify({
                success: true,
                offline: true,
                offlineId: offlineId,
                message: 'Operación guardada offline. Se sincronizará cuando haya conexión.'
              }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            });
          } catch (e) {
            return origFetch.call(this, url, opts);
          }
        }
      }

      return origFetch.call(this, url, opts);
    };
  }

  function init() {
    interceptFetch();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'TRIGGER_SYNC') {
          syncPending();
        }
        if (event.data && event.data.type === 'SYNC_BADGE') {
          updateBadge();
        }
      });
    }

    if ('ononline' in window) {
      window.addEventListener('online', function () {
        if (isOfflineMode()) {
          setTimeout(function () { syncPending(); }, 1000);
        }
      });
    }

    setInterval(function () {
      if (isOfflineMode() && navigator.onLine) {
        getPendingCount().then(function (count) {
          if (count > 0) syncPending();
        });
      }
    }, 30000);
  }

  function getBadgeCount() {
    return getPendingCount();
  }

  return {
    init: init,
    addOperation: addOperation,
    getPendingOperations: getPendingOperations,
    getPendingCount: getPendingCount,
    syncPending: syncPending,
    setTenantConfig: setTenantConfig,
    isOfflineMode: isOfflineMode,
    getBadgeCount: getBadgeCount,
    updateBadge: updateBadge
  };
})();
