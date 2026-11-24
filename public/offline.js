// The offline page: lets someone note down an expense or income with no connection.
// Entries go into the same list the app uses (coinleaf.queue.<user id>), and the app sends them next time it opens online.
(function () {
  var LAST_USER = "coinleaf.lastUser";

  // The categories and income sources the app keeps on this device (coinleaf.lists.<user id>).
  function readLists(storage) {
    var userId = storage.getItem(LAST_USER);
    if (!userId) return null;
    try {
      var v = JSON.parse(storage.getItem("coinleaf.lists." + userId) || "null");
      return v && Array.isArray(v.categories) && Array.isArray(v.sources) ? v : null;
    } catch (e) { return null; }
  }
  function has(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return true;
    return false;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return Math.floor(Math.random() * 16).toString(16); });
  }
  function today(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Returns { ok: true } or { ok: false, error }.
  function addEntry(storage, form, now) {
    var userId = storage.getItem(LAST_USER);
    if (!userId) return { ok: false, error: "Open CoinLeaf once while online and sign in, then you can add entries offline." };
    var amount = Number(form.amount);
    if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };
    if (form.type !== "expense" && form.type !== "income") return { ok: false, error: "Choose expense or income." };
    var key = "coinleaf.queue." + userId;
    var list;
    try { list = JSON.parse(storage.getItem(key) || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    var note = (form.note || "").trim().slice(0, 500);
    // Only a category or source the app knows is sent, so the server never refuses the entry for it.
    var lists = readLists(storage);
    var categoryId = form.type === "expense" && form.category && lists && has(lists.categories, form.category) ? form.category : null;
    var sourceId = form.type === "income" && form.source && lists && has(lists.sources, form.source) ? form.source : null;
    list.push({
      id: uuid(),
      body: { type: form.type, amount: amount, occurred_on: form.date || today(now), note: note || null, category_id: categoryId, income_source_id: sourceId },
      space: "personal",
      createdAt: (now || new Date()).getTime(),
    });
    try { storage.setItem(key, JSON.stringify(list)); } catch (e) { return { ok: false, error: "This device could not save the entry." }; }
    return { ok: true, waiting: list.length };
  }

  window.CoinLeafOffline = { addEntry: addEntry, today: today, readLists: readLists };

  var form = document.getElementById("offline-add");
  if (!form) return;
  var msg = document.getElementById("offline-msg");
  form.date.value = today();

  // Fill the pickers from what the app saved, and show the one that fits the type.
  var lists = readLists(localStorage);
  function fill(select, items) {
    for (var i = 0; i < items.length; i++) {
      var o = document.createElement("option");
      o.value = items[i].id;
      o.textContent = items[i].name;
      select.appendChild(o);
    }
  }
  if (lists) {
    fill(form.category, lists.categories);
    fill(form.source, lists.sources);
  } else {
    document.getElementById("offline-lists-hint").hidden = false;
  }
  function showPicker() {
    var income = form.type.value === "income";
    document.getElementById("offline-category-label").hidden = income;
    document.getElementById("offline-source-label").hidden = !income;
    if (!lists) return;
    if (!lists.categories.length) document.getElementById("offline-category-label").hidden = true;
    if (!lists.sources.length) document.getElementById("offline-source-label").hidden = true;
  }
  form.type.addEventListener("change", showPicker);
  showPicker();
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var r = addEntry(localStorage, { type: form.type.value, amount: form.amount.value, note: form.note.value, date: form.date.value, category: form.category.value, source: form.source.value });
    msg.className = r.ok ? "ok" : "bad";
    msg.textContent = r.ok ? "Saved on this device. " + r.waiting + " waiting to sync when you are back online." : r.error;
    if (r.ok) { form.amount.value = ""; form.note.value = ""; form.category.value = ""; form.source.value = ""; }
  });
})();
