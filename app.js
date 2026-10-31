// 単元データは data/ 以下のファイルが registerUnit() で登録する。
// 単元: { category, id, name, note, items }
// items は [日本語, 模範解答, ...別解] か { p: 文法ポイント, ja: 日本語, en: [模範解答, ...別解] }
const UNITS = [];
function toItem(x) {
  if (Array.isArray(x)) return x;
  const item = [x.ja, ...x.en];
  if (x.p) item.point = x.p;
  return item;
}
function registerUnit(unit) { UNITS.push({ ...unit, items: unit.items.map(toItem) }); }

const QUESTIONS_PER_ROUND = 10;
const MY_CATEGORY = "マイ単元";
const STORAGE_KEY = "eigo-quiz-my-units-v1";

const $ = id => document.getElementById(id);

// ---------- 採点 ----------
const CONTRACTIONS = {
  "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is", "it's": "it is", "we're": "we are",
  "they're": "they are", "what's": "what is", "where's": "where is", "how's": "how is", "that's": "that is",
  "there's": "there is", "let's": "let us", "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "haven't": "have not",
  "hasn't": "has not", "hadn't": "had not", "won't": "will not", "wouldn't": "would not", "can't": "cannot",
  "couldn't": "could not", "shouldn't": "should not", "mustn't": "must not", "i'll": "i will", "you'll": "you will",
  "i'd": "i would", "i've": "i have", "you've": "you have", "we've": "we have", "gotta": "got to", "wanna": "want to",
  "can not": "cannot", "mt": "mount",
};

function normalize(s) {
  let t = s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[.,!?。、！？"“”()（）\[\]—–-]/g, " ");
  t = t.split(/\s+/).filter(Boolean).map(w => CONTRACTIONS[w] || w).join(" ");
  return t.replace(/\bcan not\b/g, "cannot").replace(/\bgot to\b/g, "have to");
}
const isCorrect = (item, text) => item.slice(1).some(a => normalize(a) === normalize(text));

// ---------- マイ単元（このブラウザに保存） ----------
function loadMyUnits() {
  try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveMyUnits(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; }
  catch { toast("このブラウザでは保存できませんでした（プライベートモードなど）。"); return false; }
}
let myUnits = [];

function parseLines(text) {
  const items = [], errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(/\t|｜|\|/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) errors.push(i + 1); else items.push(parts);
  });
  return { items, errors };
}

// ---------- 画面切り替え ----------
function showScreen(id) {
  for (const s of ["home", "quiz", "end", "editor"]) $(s).classList.toggle("hidden", s !== id);
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- 単元選択 ----------
function unitButton(unit, onClick) {
  const b = document.createElement("button");
  b.className = "unit";
  const name = document.createElement("span"); name.className = "name"; name.textContent = unit.name;
  b.append(name);
  if (unit.note) { const n = document.createElement("span"); n.className = "note"; n.textContent = unit.note; b.append(n); }
  const c = document.createElement("span"); c.className = "count"; c.textContent = `${unit.items.length}問`;
  b.append(c);
  b.onclick = onClick;
  return b;
}

function renderHome() {
  const list = $("catList");
  list.innerHTML = "";
  const cats = [...new Set(UNITS.map(u => u.category))];
  for (const cat of cats) {
    const units = UNITS.filter(u => u.category === cat);
    const card = document.createElement("div"); card.className = "card";
    const head = document.createElement("div"); head.className = "catHead";
    const h = document.createElement("h2"); h.textContent = cat; head.append(h);
    if (units.length > 1) {
      const all = document.createElement("button"); all.className = "primary"; all.textContent = "ランダム10問（全範囲）";
      all.onclick = () => startQuiz({ category: cat, name: "ランダム（全範囲）", items: units.flatMap(u => u.items) });
      head.append(all);
    }
    const grid = document.createElement("div"); grid.className = "units";
    for (const u of units) grid.append(unitButton(u, () => startQuiz(u)));
    card.append(head, grid);
    list.append(card);
  }

  myUnits = loadMyUnits();
  const my = $("myUnits");
  my.innerHTML = "";
  if (!myUnits.length) {
    const e = document.createElement("div"); e.className = "empty";
    e.textContent = "まだありません。「＋ 新しい単元」から例文を登録できます。";
    my.append(e);
  }
  myUnits.forEach((u, i) => {
    const wrap = document.createElement("div"); wrap.className = "myUnit";
    const b = unitButton({ ...u, note: "" }, () => startQuiz({ ...u, category: MY_CATEGORY }));
    const edit = document.createElement("button"); edit.className = "link"; edit.textContent = "編集";
    edit.onclick = () => openEditor(i);
    wrap.append(b, edit);
    my.append(wrap);
  });
  $("exportBtn").disabled = !myUnits.length;
}

// ---------- クイズ ----------
let current = null, questions = [], idx = 0, results = [], answered = false;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startQuiz(unit, pool) {
  current = unit;
  questions = shuffle(pool || unit.items).slice(0, QUESTIONS_PER_ROUND);
  idx = 0; results = [];
  $("crumb").textContent = `${unit.category} ／ ${unit.name}`;
  showScreen("quiz");
  showQuestion();
}

function showQuestion() {
  const q = questions[idx];
  answered = false;
  stopMic(); $("micMsg").textContent = "";
  $("qnum").textContent = `第 ${idx + 1} 問 / ${questions.length}`;
  $("qscore").textContent = `正解 ${results.filter(r => r.ok).length}`;
  $("barFill").style.width = `${(idx / questions.length) * 100}%`;
  $("ja").textContent = q[0];
  $("input").value = ""; $("input").disabled = false; $("micBtn").disabled = false;
  $("checkBtn").disabled = false; $("skipBtn").disabled = false;
  $("result").className = "result";
  $("input").focus();
}

function check(skip) {
  if (answered) return;
  answered = true;
  stopMic(); $("micBtn").disabled = true;
  const q = questions[idx];
  const user = $("input").value.trim();
  const ok = !skip && user !== "" && isCorrect(q, user);
  results.push({ q, user, ok });
  $("input").disabled = true; $("checkBtn").disabled = true; $("skipBtn").disabled = true;
  $("result").className = "result " + (ok ? "ok" : "ng");
  $("resultHead").textContent = ok ? "正解！" : (skip || !user ? "答え" : "惜しい！");
  $("answer").textContent = q[1];
  $("alt").textContent = q.length > 2 ? "別の言い方: " + q.slice(2).join(" / ") : "";
  $("point").textContent = q.point ? "ポイント: " + q.point : "";
  $("overrideBtn").classList.toggle("hidden", ok || !user);
  $("qscore").textContent = `正解 ${results.filter(r => r.ok).length}`;
  speak(q[1]);
  $("nextBtn").focus();
}

function next() {
  idx++;
  if (idx < questions.length) showQuestion(); else finish();
}

function finish() {
  showScreen("end");
  const score = results.filter(r => r.ok).length;
  $("endCrumb").textContent = `${current.category} ／ ${current.name}`;
  $("finalScore").textContent = `${score} / ${results.length}`;
  $("review").innerHTML = "";
  for (const r of results) {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = "mark " + (r.ok ? "ok" : "ng"); mark.textContent = r.ok ? "○" : "×";
    li.append(mark, r.q[0], document.createElement("br"));
    const ans = document.createElement("strong"); ans.textContent = r.q[1]; li.append(ans);
    if (!r.ok && r.user) {
      const u = document.createElement("div"); u.className = "alt"; u.textContent = "あなたの回答: " + r.user; li.append(u);
    }
    $("review").append(li);
  }
  $("retryWrongBtn").classList.toggle("hidden", score === results.length);
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.95;
  speechSynthesis.speak(u);
}

// ---------- 音声入力（Web Speech API） ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC_FALLBACK = "この環境ではマイクボタンが使えません。キーボードの音声入力（Windows: Win + H / Mac: Fn を2回 / スマホ: キーボードのマイク）で入力してください。";
let rec = null, listening = false;

function stopMic() {
  if (rec && listening) rec.abort();
  listening = false; $("micBtn").classList.remove("on");
}

function startMic() {
  if (!SR) { $("micMsg").textContent = MIC_FALLBACK; return; }
  rec = new SR();
  rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3;
  let finalText = "";
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        // 候補の中に正解と一致するものがあればそれを採用する
        const alts = Array.from(r).map(a => a.transcript.trim());
        finalText = alts.find(t => isCorrect(questions[idx], t)) || alts[0];
      } else interim += r[0].transcript;
    }
    $("input").value = finalText || interim;
  };
  rec.onerror = e => {
    listening = false; $("micBtn").classList.remove("on");
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) $("micMsg").textContent = MIC_FALLBACK;
    else if (e.error === "no-speech") $("micMsg").textContent = "声が聞き取れませんでした。もう一度🎤を押して話してください。";
    else if (e.error !== "aborted") $("micMsg").textContent = "音声認識でエラーが起きました（" + e.error + "）。";
  };
  rec.onend = () => {
    const wasListening = listening;
    listening = false; $("micBtn").classList.remove("on");
    if (wasListening && finalText && !answered) { $("micMsg").textContent = "聞き取り: " + finalText; check(false); }
  };
  try {
    rec.start(); listening = true;
    $("micBtn").classList.add("on"); $("micMsg").textContent = "聞いています… 英語で話してください";
  } catch { $("micMsg").textContent = MIC_FALLBACK; }
}

// ---------- マイ単元エディタ ----------
let editingIndex = -1, deleteArmed = false;

function openEditor(i) {
  editingIndex = i; deleteArmed = false;
  const u = i >= 0 ? myUnits[i] : { name: "", items: [] };
  $("editorTitle").textContent = i >= 0 ? "単元を編集" : "新しい単元";
  $("unitName").value = u.name;
  $("unitBody").value = u.items.map(it => it.join(" | ")).join("\n");
  $("deleteUnitBtn").classList.toggle("hidden", i < 0);
  $("deleteConfirm").classList.add("hidden");
  updatePreview();
  showScreen("editor");
  $("unitName").focus();
}

function updatePreview() {
  const { items, errors } = parseLines($("unitBody").value);
  const p = $("preview");
  if (errors.length) {
    p.className = "preview err";
    p.textContent = `${errors.join(", ")} 行目に「|」がありません。日本語と英語を「|」で区切ってください。`;
  } else {
    p.className = "preview";
    p.textContent = items.length ? `${items.length} 問を読み取りました。` : "";
  }
  return { items, errors };
}

function saveEditor() {
  const name = $("unitName").value.trim();
  const { items, errors } = updatePreview();
  if (!name) { toast("単元名を入力してください。"); $("unitName").focus(); return; }
  if (errors.length) { toast("区切りのない行があります。"); return; }
  if (!items.length) { toast("例文を1つ以上入力してください。"); return; }
  const list = loadMyUnits();
  const unit = { id: editingIndex >= 0 ? list[editingIndex].id : "my-" + Date.now(), name, items };
  if (editingIndex >= 0) list[editingIndex] = unit; else list.push(unit);
  if (!saveMyUnits(list)) return;
  toast(`「${name}」を保存しました（${items.length}問）。`);
  renderHome(); showScreen("home");
}

function deleteUnit() {
  if (!deleteArmed) { deleteArmed = true; $("deleteConfirm").classList.remove("hidden"); return; }
  const list = loadMyUnits();
  const [removed] = list.splice(editingIndex, 1);
  if (!saveMyUnits(list)) return;
  toast(`「${removed.name}」を削除しました。`);
  renderHome(); showScreen("home");
}

function exportUnits() {
  const data = JSON.stringify({ app: "eigo-quiz", version: 1, units: loadMyUnits() }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = `my-units-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("マイ単元をファイルに書き出しました。");
}

async function importUnits(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = (data.units || []).filter(u => u && u.name && Array.isArray(u.items))
      .map(u => ({ id: u.id || "my-" + Date.now() + Math.random(), name: String(u.name),
        items: u.items.filter(it => Array.isArray(it) && it.length >= 2).map(it => it.map(String)) }))
      .filter(u => u.items.length);
    if (!incoming.length) { toast("読み込める単元がありませんでした。"); return; }
    const list = loadMyUnits();
    let added = 0, updated = 0;
    for (const u of incoming) {
      const i = list.findIndex(x => x.id === u.id);
      if (i >= 0) { list[i] = u; updated++; } else { list.push(u); added++; }
    }
    if (!saveMyUnits(list)) return;
    renderHome();
    toast(`${added}単元を追加${updated ? `、${updated}単元を更新` : ""}しました。`);
  } catch {
    toast("ファイルを読み込めませんでした。「書き出す」で作ったファイルか確認してください。");
  }
}

// ---------- 起動 ----------
function startApp() {
  $("checkBtn").onclick = () => check(false);
  $("skipBtn").onclick = () => check(true);
  $("nextBtn").onclick = next;
  $("speakBtn").onclick = () => speak(questions[idx][1]);
  $("overrideBtn").onclick = () => {
    results[results.length - 1].ok = true;
    $("result").className = "result ok"; $("resultHead").textContent = "正解にしました";
    $("overrideBtn").classList.add("hidden");
    $("qscore").textContent = `正解 ${results.filter(r => r.ok).length}`;
    $("nextBtn").focus();
  };
  $("input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); check(false); }
  });
  $("micBtn").onclick = () => { if (listening) stopMic(); else { window.speechSynthesis?.cancel(); startMic(); } };
  $("quitBtn").onclick = () => { stopMic(); renderHome(); showScreen("home"); };
  $("againBtn").onclick = () => startQuiz(current);
  $("retryWrongBtn").onclick = () => startQuiz(current, results.filter(r => !r.ok).map(r => r.q));
  $("homeBtn").onclick = () => { renderHome(); showScreen("home"); };

  $("newUnitBtn").onclick = () => openEditor(-1);
  $("unitBody").addEventListener("input", updatePreview);
  $("saveUnitBtn").onclick = saveEditor;
  $("cancelEditBtn").onclick = () => showScreen("home");
  $("deleteUnitBtn").onclick = deleteUnit;
  $("exportBtn").onclick = exportUnits;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = e => { const f = e.target.files[0]; if (f) importUnits(f); e.target.value = ""; };

  renderHome();
}
