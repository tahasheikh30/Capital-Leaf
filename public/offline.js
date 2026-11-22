// The offline page: lets someone note down an expense or income with no connection.
// Entries go into the same list the app uses (coinleaf.queue.<user id>), and the app sends them next time it opens online.
(function () {
  var LAST_USER = "coinleaf.lastUser";

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
    list.push({
      id: uuid(),
      body: { type: form.type, amount: amount, occurred_on: form.date || today(now), note: note || null, category_id: null, income_source_id: null },
      space: "personal",
      createdAt: (now || new Date()).getTime(),
    });
    try { storage.setItem(key, JSON.stringify(list)); } catch (e) { return { ok: false, error: "This device could not save the entry." }; }
    return { ok: true, waiting: list.length };
  }

  window.CoinLeafOffline = { addEntry: addEntry, today: today };

  var form = document.getElementById("offline-add");
  if (!form) return;
  var msg = document.getElementById("offline-msg");
  form.date.value = today();
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var r = addEntry(localStorage, { type: form.type.value, amount: form.amount.value, note: form.note.value, date: form.date.value });
    msg.className = r.ok ? "ok" : "bad";
    msg.textContent = r.ok ? "Saved on this device. " + r.waiting + " waiting to sync when you are back online." : r.error;
    if (r.ok) { form.amount.value = ""; form.note.value = ""; }
  });
})();
