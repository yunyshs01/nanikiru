/* ===== Tileset (GitHub raw) ===== */
const TILESET = {
  base: "https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/",
  ext: "svg",
};
function tileAssetNameFromCode(code){
  const m = String(code).match(/^([0-9])([mpsz])$/);
  if(!m) return null;
  const num = m[1];
  const suit = m[2];

  if(suit === "m" || suit === "p" || suit === "s"){
    const suitName = suit === "m" ? "Man" : (suit === "p" ? "Pin" : "Sou");
    if(num === "0") return `${suitName}5-Dora`;
    return `${suitName}${num}`;
  }
  const zMap = { "1":"Ton","2":"Nan","3":"Shaa","4":"Pei","5":"Haku","6":"Hatsu","7":"Chun" };
  return zMap[num] || null;
}
function tileImgUrl(code){
  const name = tileAssetNameFromCode(code);
  if(!name) return null;
  return `${TILESET.base}${name}.${TILESET.ext}`;
}

/* ===== Storage ===== */
const LS_KEY = "nanikiru.baseProblems.v2";
function loadBaseProblems(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    for(const p of arr){
      if(!p.id) p.id = crypto.randomUUID();
      if(typeof p.isFavorite !== "boolean") p.isFavorite = !!p.isFavorite;
      if(!("doraIndicator" in p)) p.doraIndicator = "";
      if(!("condition" in p)) p.condition = "";
      if(!("melds" in p)) p.melds = "";
    }
    return arr;
  }catch{ return []; }
}
function saveBaseProblems(arr){
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

/* ===== Parsing ===== */
const SUITS = new Set(["m","p","s","z"]);
const WIND_KR = ["동","남","서","북"];

const ROUND_LIST = [
  "동1국","동2국","동3국","동4국",
  "남1국","남2국","남3국","남4국",
];

function splitTokens(str){
  return String(str ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(s=>s.trim())
    .filter(Boolean);
}
function normalizeSeatWind(v){
  const s = String(v ?? "").trim();
  if(s === "1") return "동";
  if(s === "2") return "남";
  if(s === "3") return "서";
  if(s === "4") return "북";
  // 혹시 숫자+문자 섞였을 때도 대비
  if(s.startsWith("동")) return "동";
  if(s.startsWith("남")) return "남";
  if(s.startsWith("서")) return "서";
  if(s.startsWith("북")) return "북";
  return s;
}

function normalizeRound(v){
  // 허용: "동1국"~"남4국" 또는 숫자 1~8(동1국=1 ... 남4국=8)
  if(typeof v === "number" && Number.isFinite(v)){
    const i = Math.trunc(v);
    return ROUND_LIST[i-1] ?? String(v);
  }
  const s0 = String(v ?? "").trim();
  if(!s0) return "동1국";
  if(/^\d+$/.test(s0)){
    const i = parseInt(s0,10);
    return ROUND_LIST[i-1] ?? s0;
  }
  // 동1국/남4국 같은 형태
  const m = s0.match(/^(동|남)\s*([1-4])\s*국?$/);
  if(m){
    return `${m[1]}${m[2]}국`;
  }
  // 이미 올바른 값이면 그대로
  return s0;
}

function normalizeTurn(v){
  // 허용: 숫자 또는 "10순" 같은 문자열
  if(typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v ?? "").trim();
  if(!s) return 1;
  const m = s.match(/^(\d+)\s*순?$/);
  if(m) return parseInt(m[1],10);
  if(/^\d+$/.test(s)) return parseInt(s,10);
  const n = parseInt(s,10);
  return Number.isFinite(n) ? n : 1;
}

/* 후로 파서/검증: 666'm, 23'4s, 111'1p, 4444'z */
function parseMeldNotation(token){
  const t = String(token ?? "").trim();
  if(!t) return null;
  const m = t.match(/^([0-9']+)([mpsz])$/);
  if(!m) throw new Error(`후로 형식 오류: ${t}`);
  const digitsRaw = m[1];
  const suit = m[2];
  const digits = digitsRaw.replaceAll("'", "");
  if(!digits || !/^[0-9]+$/.test(digits)) throw new Error(`후로 숫자 오류: ${t}`);
  const nums = digits.split("").map(x=>parseInt(x,10));
  if(!(nums.length === 3 || nums.length === 4)) throw new Error(`후로 장수는 3(치/퐁) 또는 4(깡)만 가능: ${t}`);

  // 숫자 범위
  if(suit === "z"){
    if(nums.some(n => n === 0 || n < 1 || n > 7)) throw new Error(`자패 후로 숫자 오류(1~7z만): ${t}`);
  }else{
    if(nums.some(n => (n !== 0 && (n < 1 || n > 9)))) throw new Error(`수패 후로 숫자 오류(1~9, 적5는 0): ${t}`);
  }

  const mapped = nums.map(n => (n===0 ? 5 : n));
  let kind = null;

  if(nums.length === 3){
    const allSame = (mapped[0] === mapped[1] && mapped[1] === mapped[2]);
    if(allSame){
      kind = "pon";
    }else{
      if(!(suit === "m" || suit === "p" || suit === "s")) throw new Error(`자패는 치 불가: ${t}`);
      const sorted = [...mapped].sort((a,b)=>a-b);
      const isSeq = (sorted[0]+1 === sorted[1] && sorted[1]+1 === sorted[2]);
      if(!isSeq) throw new Error(`치(연속 3장) 또는 퐁(동일 3장)만 가능: ${t}`);
      kind = "chi";
    }
  }else{
    const allSame = mapped.every(x => x === mapped[0]);
    if(!allSame) throw new Error(`깡은 동일 4장만 가능: ${t}`);
    kind = "kan";
  }

  const tiles = nums.map(n => `${n}${suit}`);
  return { raw: t, kind, tiles, count: nums.length };
}
function parseMeldList(str){
  const tokens = splitTokens(str);
  const melds = tokens.map(parseMeldNotation).filter(Boolean);
  return { tokens, melds, tileCount: melds.reduce((s,m)=>s+m.count,0) };
}

function cleanTileString(str){
  return (str||"").trim().replace(/\s+/g,"").replace(/[|,]/g,"");
}
function parseMpszHand(handStr){
  const s = cleanTileString(handStr);
  let digits = "";
  const tiles = [];
  for(const ch of s){
    if(/[0-9]/.test(ch)){ digits += ch; continue; }
    if(SUITS.has(ch)){
      if(!digits) throw new Error("수패/자패 숫자 뒤에 m/p/s/z가 와야 해.");
      for(const d of digits) tiles.push(`${d}${ch}`);
      digits = "";
      continue;
    }
    throw new Error(`허용되지 않는 문자: ${ch}`);
  }
  if(digits) throw new Error("마지막에 m/p/s/z가 빠졌어.");
  return tiles;
}
function isTileCode(t){ return /^[0-9][mpsz]$/.test(t); }

function parseTileList(str, max=5){
  const s = String(str ?? "").trim();
  const matches = s.match(/[0-9][mpsz]/g);
  if(!matches) return [];
  return matches.slice(0, max);
}

function tenhouUrlFromHand(handStr){
  const q = encodeURIComponent(cleanTileString(handStr));
  return `https://tenhou.net/2/?q=${q}`;
}

/* ===== Display order (만-통-삭-자 + 쯔모) ===== */
const SUIT_PRIORITY = { m: 0, p: 1, s: 2, z: 3 };
function sortKey(tile){
  const num = parseInt(tile[0], 10);
  const suit = tile[1];
  const n = (num === 0 ? 5 : num);
  return [SUIT_PRIORITY[suit] ?? 9, n, tile];
}
function orderTilesForDisplay(handStr){
  const tiles = parseMpszHand(handStr);
  if(tiles.length === 0) return tiles;
  const tsumo = tiles[tiles.length - 1];
  const rest = tiles.slice(0, -1);
  rest.sort((a,b)=>{
    const ka = sortKey(a), kb = sortKey(b);
    for(let i=0;i<ka.length;i++){
      if(ka[i] < kb[i]) return -1;
      if(ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  return [...rest, tsumo];
}

/* ===== 종류 치환(모든 순열) ===== */
function permutations3(arr){
  const [a,b,c] = arr;
  return [
    [a,b,c],[a,c,b],
    [b,a,c],[b,c,a],
    [c,a,b],[c,b,a],
  ];
}
function roundWindFromRound(roundStr){
  if(String(roundStr).startsWith("동")) return "1z";
  if(String(roundStr).startsWith("남")) return "2z";
  return "1z";
}
function seatWindToZ(seatWindKr){
  const idx = WIND_KR.indexOf(seatWindKr);
  return `${idx+1}z`;
}
function windMapsForBase(base){
  const fixed = new Set([roundWindFromRound(base.round), seatWindToZ(base.seatWind)]);
  const winds = ["1z","2z","3z","4z"];
  const free = winds.filter(w => !fixed.has(w));
  if(free.length !== 2) return [{}];
  const [x,y] = free;
  return [
    {},
    { [x]: y, [y]: x }
  ];
}
function applyMappingToTile(tile, map){
  const m = tile.match(/^([0-9])([mpsz])$/);
  if(!m) return tile;
  const num = m[1], suit = m[2];

  if(suit === "m" || suit === "p" || suit === "s"){
    const newSuit = map.suit?.[suit] || suit;
    return `${num}${newSuit}`;
  }
  const z = `${num}z`;
  if(map.dragon && (z==="5z"||z==="6z"||z==="7z")) return map.dragon[z] || z;
  if(map.wind && (z==="1z"||z==="2z"||z==="3z"||z==="4z")) return map.wind[z] || z;
  return z;
}
function tilesToMpszString(tiles){
  let out = "", buf = "", curSuit = null;
  for(const t of tiles){
    const m = t.match(/^([0-9])([mpsz])$/);
    if(!m) continue;
    const d = m[1], s = m[2];
    if(curSuit === null){ curSuit = s; buf = d; }
    else if(s === curSuit){ buf += d; }
    else{ out += buf + curSuit; curSuit = s; buf = d; }
  }
  if(curSuit !== null) out += buf + curSuit;
  return out;
}
function applyMappingToHandStr(handStr, map){
  const tiles = parseMpszHand(handStr);
  const mapped = tiles.map(t => applyMappingToTile(t, map));
  return tilesToMpszString(mapped);
}
function parseAnswerList(answerStr){
  const s = String(answerStr || "");
  const matches = s.match(/[0-9][mpsz]/g);
  return matches ? [...new Set(matches)] : [];
}
function makeVariantProblemWithMap(base, map){
  const v = structuredClone(base);
  v._isVariant = true;
  v._baseId = base.id;
  v._map = map;

  v.hand = applyMappingToHandStr(base.hand, map);

  const ans = parseAnswerList(base.answer);
  v.answer = (ans.length ? ans : [base.answer]).map(t => applyMappingToTile(t, map)).join(",");

  v.doraIndicator = parseTileList(base.doraIndicator, 5)
    .map(t => applyMappingToTile(t, map))
    .join(",");

  return v;
}

/* ===== State ===== */
let baseProblems = loadBaseProblems();
let quizPool = [];
let history = [];
let idx = -1;
let revealed = false;
let selected = null;
let selectedIndex = null;

const $ = (id)=>document.getElementById(id);

function favoritesOnlyOn(){ return $("toggleFavOnly")?.checked; }
function shuffleOn(){ return $("toggleShuffle")?.checked; }

function rebuildQuizPool(){
  const enable = $("toggleRandomize").checked;
  const pool = [];

  if(!enable){
    for(const p of baseProblems) pool.push({...p, _isVariant:false});
    quizPool = pool;
    return;
  }

  const suitPerms = permutations3(["m","p","s"]);
  const dragonPerms = permutations3(["5z","6z","7z"]);

  for(const p of baseProblems){
    pool.push({...p, _isVariant:false});

    const windMaps = windMapsForBase(p);
    for(const sp of suitPerms){
      const suitMap = { m: sp[0], p: sp[1], s: sp[2] };
      for(const dp of dragonPerms){
        const dragonMap = { "5z": dp[0], "6z": dp[1], "7z": dp[2] };
        for(const wm of windMaps){
          const map = { suit: suitMap, dragon: dragonMap, wind: wm };
          pool.push(makeVariantProblemWithMap(p, map));
        }
      }
    }
  }
  quizPool = pool;
}

function getActiveBaseList(){
  return favoritesOnlyOn()
    ? baseProblems.filter(p => !!p.isFavorite)
    : baseProblems;
}
function getActivePoolForShuffle(){
  if(!favoritesOnlyOn()) return quizPool;
  const favIds = new Set(baseProblems.filter(p=>p.isFavorite).map(p=>p.id));
  return quizPool.filter(q => q._isVariant ? favIds.has(q._baseId) : favIds.has(q.id));
}
function baseIdOf(q){
  if(!q) return null;
  return q._isVariant ? q._baseId : q.id;
}
function pickRandom(pool, avoidBaseId=null){
  if(pool.length === 0) return null;
  if(pool.length === 1) return pool[0];
  for(let k=0;k<6;k++){
    const q = pool[Math.floor(Math.random()*pool.length)];
    if(avoidBaseId && baseIdOf(q) === avoidBaseId) continue;
    return q;
  }
  return pool[Math.floor(Math.random()*pool.length)];
}
function pickNextSequentialBase(afterBaseId=null){
  const list = getActiveBaseList();
  if(list.length === 0) return null;
  let i = 0;
  if(afterBaseId){
    const found = list.findIndex(p => p.id === afterBaseId);
    i = (found >= 0) ? (found + 1) : 0;
  }
  if(i >= list.length) i = 0;
  return {...list[i], _isVariant:false};
}
function chooseNextQuestion(){
  rebuildQuizPool();
  const cur = history[idx] || null;
  const curBaseId = baseIdOf(cur);

  if(shuffleOn()){
    const pool = getActivePoolForShuffle();
    return pickRandom(pool, curBaseId);
  }else{
    return pickNextSequentialBase(curBaseId);
  }
}

/* ===== UI helpers ===== */
function setStats(){
  $("statBase").textContent = baseProblems.length;
  $("statFav").textContent = baseProblems.filter(p=>p.isFavorite).length;
}
function getBaseProblemRefFromAny(q){
  if(!q) return null;
  const id = q._isVariant ? q._baseId : q.id;
  return baseProblems.find(p => p.id === id) || null;
}
function setStarButtonVisual(isOn){
  const btn = $("btnFavInCard");
  if(!btn) return;
  btn.classList.toggle("on", !!isOn);
  const svg = btn.querySelector("svg");
  if(svg){
    svg.setAttribute("fill", isOn ? "#ffd34d" : "none");
    svg.setAttribute("stroke", isOn ? "#ffd34d" : "#9aa6b2");
  }
}
function syncCardFavoriteButton(){
  const q = history[idx];
  const ref = getBaseProblemRefFromAny(q);
  setStarButtonVisual(ref ? !!ref.isFavorite : false);
}
function loadSpecificProblem(baseProblem){
  if(!baseProblem) return;
  history = [{...baseProblem, _isVariant:false}];
  idx = 0;
  renderCurrent();
}

function renderProblemList(){
  const root = $("problemList");
  root.innerHTML = "";
  if(baseProblems.length === 0){
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "아직 문제가 없어. ‘문제 추가’로 시작해줘.";
    root.appendChild(div);
    return;
  }

  for(const p of baseProblems){
    const it = document.createElement("div");
    it.className = "item";
    it.style.cursor = "pointer";
    it.title = "클릭하면 이 문제를 불러옵니다";
    it.addEventListener("click", ()=> loadSpecificProblem(p));

    const left = document.createElement("div");
    left.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.title || "(제목 없음)";
    left.appendChild(name);

    const right = document.createElement("div");
    right.className = "row";
    right.style.gap = "8px";

    const star = document.createElement("button");
    star.className = "star" + (p.isFavorite ? " on": "");
    star.innerHTML = `
      <svg viewBox="0 0 24 24" fill="${p.isFavorite ? "#ffd34d":"none"}" stroke="${p.isFavorite ? "#ffd34d":"#9aa6b2"}" stroke-width="2">
        <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z"/>
      </svg>
    `;
    star.title = "즐겨찾기";
    star.addEventListener("click", (e)=>{
      e.stopPropagation();
      p.isFavorite = !p.isFavorite;
      saveBaseProblems(baseProblems);
      setStats();
      renderProblemList();
      syncCardFavoriteButton();
      ensureCurrentStillSelectable();
    });

    const del = document.createElement("button");
    del.className = "btn small danger";
    del.textContent = "삭제";
    del.addEventListener("click", (e)=>{
      e.stopPropagation();
      if(!confirm("이 문제를 삭제할까?")) return;
      const delId = p.id;
      baseProblems = baseProblems.filter(x=>x.id !== delId);
      saveBaseProblems(baseProblems);
      setStats();
      renderProblemList();

      const cur = history[idx];
      if(cur && baseIdOf(cur) === delId){
        history = [];
        idx = -1;
        setCardEmpty();
      }else{
        ensureCurrentStillSelectable();
      }
    });

    right.appendChild(star);
    right.appendChild(del);

    it.appendChild(left);
    it.appendChild(right);
    root.appendChild(it);
  }
}

function tileEl(tile, opts={}){
  const btn = document.createElement("button");
  btn.className = "tileBtn" + (opts.tsumo ? " tsumo" : "");
  btn.type = "button";
  btn.dataset.tile = tile;

  const face = document.createElement("div");
  face.className = "tileFace";

  const url = tileImgUrl(tile);
  const img = document.createElement("img");
  img.className = "tileSvg";
  img.alt = tile;
  if(url) img.src = url;

  img.onerror = () => {
    const t = document.createElement("div");
    t.className = "tileTextFallback";
    t.textContent = tile;
    face.appendChild(t);
    img.remove();
  };

  face.appendChild(img);
  btn.appendChild(face);
  return btn;
}
function makeBackTile(){
  const btn = document.createElement("button");
  btn.className = "tileBtn";
  btn.type = "button";
  btn.disabled = true;
  btn.style.cursor = "default";

  const face = document.createElement("div");
  face.className = "tileFace back";
  btn.appendChild(face);
  return btn;
}

function setCardEmpty(){
  $("qTitle").textContent = "아직 문제를 시작하지 않았어.";
  $("qMeta").innerHTML = "";
  $("tiles").innerHTML = "";

  $("metaBox").innerHTML = `<span class="muted">-</span>`;
  $("doraIndicatorBox").innerHTML = "";

  $("result").style.display = "none";
  $("btnReveal").disabled = true;
  $("btnNext").disabled = true;
  $("btnPrev").disabled = true;
  setStarButtonVisual(false);

  revealed = false;
  selected = null;
  selectedIndex = null;
}

function highlightSelectedTile(){
  const all = [...$("tiles").querySelectorAll(".tileBtn")];
  all.forEach(x=>x.classList.remove("selected"));
  if(selectedIndex === null) return;
  const b = all.find(x => Number(x.dataset.index) === selectedIndex);
  if(b) b.classList.add("selected");
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function attemptReveal(){
  const p = history[idx];
  if(!p) return;
  if($("btnReveal")?.disabled) return;
  if(revealed) return;

  const btns = [...$("tiles").querySelectorAll(".tileBtn")];
  if(btns.length === 0) return;

  if(selectedIndex === null || selectedIndex >= btns.length){
    selectedIndex = btns.length - 1;
    selected = btns[selectedIndex]?.dataset.tile || selected;
    highlightSelectedTile();
  }
  reveal();
}

function renderCurrent(){
  const p = history[idx];
  if(!p){ setCardEmpty(); return; }

  revealed = false;
  $("result").style.display = "none";
  $("btnReveal").disabled = false;
  $("btnNext").disabled = true;
  $("btnPrev").disabled = idx <= 0;

  $("qTitle").textContent = p.title || "(제목 없음)";

  $("qMeta").innerHTML = "";
  const ref = getBaseProblemRefFromAny(p);
  const meta = [
    p._isVariant ? "종류 치환(변형)" : "기본 문제",
    ref?.isFavorite ? "★ 즐겨찾기" : null
  ].filter(Boolean);
  for(const m of meta){
    const sp = document.createElement("span");
    sp.className = "chip";
    sp.textContent = m;
    $("qMeta").appendChild(sp);
  }

  /* 현재 정보 */
  $("metaBox").innerHTML = "";
  const b1 = document.createElement("span");
  b1.className = "badge";
  b1.textContent = p.round;
  $("metaBox").appendChild(b1);

  const b2 = document.createElement("span");
  b2.className = "badge";
  b2.textContent = `${p.turn}순`;
  $("metaBox").appendChild(b2);

  const b3 = document.createElement("span");
  b3.className = "badge";
  b3.textContent = `자풍 ${p.seatWind}`;
  $("metaBox").appendChild(b3);

  const conds = splitTokens(p.condition);
  for(const c of conds){
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = c;
    $("metaBox").appendChild(b);
  }

  /* 도라: 최대 5개 (입력된 개수만 공개, 나머지 Back) */
  $("doraIndicatorBox").innerHTML = "";
  const MAX_DORA_INDICATORS = 5;
  const doraList = parseTileList(p.doraIndicator, MAX_DORA_INDICATORS);

  for(const t of doraList){
    const d = tileEl(t, {tsumo:false});
    d.disabled = true;
    d.style.cursor = "default";
    $("doraIndicatorBox").appendChild(d);
  }
  for(let i=doraList.length; i<MAX_DORA_INDICATORS; i++){
    $("doraIndicatorBox").appendChild(makeBackTile());
  }

  /* 손패 */
  const tiles = orderTilesForDisplay(p.hand);
  $("tiles").innerHTML = "";

  tiles.forEach((t,i)=>{
    const btn = tileEl(t, {tsumo: i === tiles.length-1});
    btn.dataset.index = String(i);

    btn.addEventListener("click", ()=>{
      if(revealed) return;

      if(selectedIndex === i){
        attemptReveal();
        return;
      }
      selectedIndex = i;
      selected = tiles[selectedIndex];
      highlightSelectedTile();
    });

    $("tiles").appendChild(btn);
  });

  selectedIndex = tiles.length ? tiles.length - 1 : null; // 기본=쯔모
  selected = (selectedIndex !== null) ? tiles[selectedIndex] : null;
  highlightSelectedTile();

  // 후로 표시(선택 불가, 순서 유지)
  const meldTokens = splitTokens(p.melds);
  const meldEl = $("meldsLines");
  if(meldTokens.length){
    meldEl.style.display = "block";
    meldEl.textContent = "후로\n" + meldTokens.join("\n");
  }else{
    meldEl.style.display = "none";
    meldEl.textContent = "";
  }

  syncCardFavoriteButton();
}

function reveal(){
  const p = history[idx];
  if(!p) return;
  if(revealed) return;
  revealed = true;
  $("btnReveal").disabled = true;

  if(selectedIndex === null || !selected){
    alert("선택된 패가 없어. (버그)");
    return;
  }

  const answers = parseAnswerList(p.answer);
  const correctOne = answers[0] || p.answer;
  const ok = answers.length ? answers.includes(selected) : (selected === p.answer);

  const btns = [...$("tiles").querySelectorAll(".tileBtn")];
  btns.forEach(b=>b.classList.remove("correct","wrong"));

  const pickedBtn = btns.find(b => Number(b.dataset.index) === selectedIndex);
  if(pickedBtn) pickedBtn.classList.add(ok ? "correct" : "wrong");

  if(!ok){
    const correctBtn = btns.find(b => (b.dataset.tile || "").trim() === String(correctOne).trim());
    if(correctBtn) correctBtn.classList.add("correct");
  }

  const tenhou = tenhouUrlFromHand(p.hand) + "#m2";
  const doraDisp = parseTileList(p.doraIndicator, 5).join(",") || "-";

  $("result").style.display = "flex";
  $("result").innerHTML = `
    <div class="rowLine">
      <span class="badge ${ok ? "good":"bad"}">${ok ? "정답!" : "오답"}</span>
      <span class="badge">내 선택: <b>${escapeHtml(selected)}</b></span>
      <span class="badge">정답: <b>${escapeHtml(answers.length ? answers.join(", ") : p.answer)}</b></span>
      <span class="badge">도라표지: <b>${escapeHtml(doraDisp)}</b></span>
    </div>

    <div class="rowLine" style="margin-top:2px">
      <span class="badge">해설 링크</span>
      ${
        p.explanationLink
          ? `<a href="${p.explanationLink}" target="_blank" rel="noreferrer">${escapeHtml(p.explanationLink)}</a>`
          : `<span class="muted">없음</span>`
      }
    </div>

    <div class="twoCol">
      <div class="box">
        <h3>해설</h3>
        <div class="big">${p.explanation ? escapeHtml(p.explanation) : `<span class="muted">해설 글 없음</span>`}</div>
      </div>

      <div class="box">
        <h3>패효율 (Tenhou)</h3>
        <iframe
          title="Tenhou"
          src="${tenhou}"
          style="width:100%; height:520px; border:1px solid var(--line); border-radius:12px; background:#fff"
          loading="lazy"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  `;
  $("btnNext").disabled = false;
}

function nextByMode(){
  const q = chooseNextQuestion();
  if(!q){
    alert("선택 가능한 문제가 없어. (즐겨찾기만 체크 상태인지 확인)");
    return;
  }
  history = history.slice(0, idx+1);
  history.push(q);
  idx++;
  renderCurrent();
}
function prev(){
  if(idx <= 0) return;
  idx--;
  renderCurrent();
}

/* ===== Modal ===== */
function openModal(){
  $("modalOverlay").classList.add("show");
  $("modalOverlay").setAttribute("aria-hidden","false");
}
function closeModal(){
  $("modalOverlay").classList.remove("show");
  $("modalOverlay").setAttribute("aria-hidden","true");
}
function resetAddForm(){
  $("fTitle").value = "";
  $("fRound").value = "동1국";
  $("fTurn").value = "1";
  $("fSeatWind").value = "서";
  $("fCondition").value = "";
  $("fMelds").value = "";
  $("fDora").value = "";
  $("fHand").value = "";
  $("fAnswer").value = "";
  $("fLink").value = "";
  $("fExplanation").value = "";
  $("bulkJsonText").value = "";
}

function validateAndBuildProblem(raw){
  const title = (raw.title ?? "").toString().trim();
  const round = normalizeRound(raw.round ?? "동1국");
  const turn = normalizeTurn(raw.turn ?? 1);

  const seatWind = normalizeSeatWind(raw.seatWind ?? "동").toString();

  const conditionRaw = (raw.condition ?? raw.conditions ?? "").toString().trim();
  const condition = splitTokens(conditionRaw).join(", ");

  const meldRaw = (raw.melds ?? raw.furo ?? raw.meld ?? "").toString().trim();
  const meldParsed = parseMeldList(meldRaw);
  const melds = meldParsed.tokens.join(", ");

  const doraRaw = String(raw.doraIndicator ?? "").trim();
  const doraList = parseTileList(doraRaw, 5);

  const hand = cleanTileString(raw.hand ?? "");
  const answer = String(raw.answer ?? "");

  const explanationLink = (raw.explanationLink ?? "").toString();
  const explanation = (raw.explanation ?? "").toString();
  const isFavorite = !!raw.isFavorite;

  const handTiles = parseMpszHand(hand);

  // 총 14장(손패 + 후로)
  if(handTiles.length + meldParsed.tileCount !== 14){
    throw new Error(`손패+후로 합계가 14장이 아니야. (손패 ${handTiles.length} + 후로 ${meldParsed.tileCount} = ${handTiles.length + meldParsed.tileCount})`);
  }

  const answers = parseAnswerList(answer);
  if(answers.length === 0) throw new Error("정답 형식 오류");

  if(doraList.length < 1 || doraList.length > 5) throw new Error("도라표지패는 1~5개여야 해.");
  if(!WIND_KR.includes(seatWind)) throw new Error("자풍 오류 (동/남/서/북 또는 1~4)");

  // 후로는 여기까지 왔으면 형식/종류 검증 완료

  return {
    id: crypto.randomUUID(),
    title, round, turn, seatWind,
    condition,
    melds,
    doraIndicator: doraList.join(","), // 표준 저장
    hand,
    answer: answers.join(","),
    explanationLink, explanation,
    isFavorite,
  };
}

function importProblemsArray(arr){
  const imported = [];
  for(const raw of arr){
    try{
      const p = validateAndBuildProblem(raw);
      imported.push(p);
    }catch{}
  }
  if(imported.length === 0){
    alert("유효한 문제를 하나도 가져오지 못했어. (손패14장/정답/도라 형식 확인)");
    return 0;
  }
  baseProblems = [...imported, ...baseProblems];
  saveBaseProblems(baseProblems);
  setStats();
  renderProblemList();
  ensureCurrentStillSelectable();
  return imported.length;
}
function importFromText(txt){
  let data;
  try{ data = JSON.parse(txt); }
  catch{ alert("JSON 파싱 실패"); return; }
  let arr = Array.isArray(data) ? data : (Array.isArray(data.problems) ? data.problems : null);
  if(arr && arr.length === 1 && Array.isArray(arr[0])) arr = arr[0];
  if(!arr){ alert("가져올 JSON이 배열 형태가 아니야."); return; }
  const n = importProblemsArray(arr);
  if(n>0) alert(`${n}개 문제를 가져왔어.`);
}

function saveFromForm(){
  // 저장 버튼은 "일괄 추가"가 있으면 우선 처리
  const bulk = $("bulkJsonText").value.trim();
  if(bulk){
    importFromText(bulk);
    $("bulkJsonText").value = "";
    closeModal();
    return;
  }

  try{
    const obj = {
      title: $("fTitle").value.trim(),
      round: $("fRound").value,
      turn: parseInt($("fTurn").value, 10) || 1,
      seatWind: $("fSeatWind").value,
      condition: $("fCondition").value.trim(),
      melds: $("fMelds").value.trim(),
      doraIndicator: $("fDora").value.trim(),
      hand: $("fHand").value.trim(),
      answer: $("fAnswer").value.trim(),
      explanationLink: $("fLink").value.trim(),
      explanation: $("fExplanation").value,
      isFavorite: false,
    };
    const p = validateAndBuildProblem(obj);
    baseProblems.unshift(p);
    saveBaseProblems(baseProblems);
    setStats();
    renderProblemList();
    closeModal();
    ensureCurrentStillSelectable();
  }catch(e){
    alert("저장 실패: " + e.message);
  }
}

function exportJsonArrayForUser(){
  // 현재 목록의 역순(화면에서 위→아래가 최신이라면, 내보내기는 오래된 것부터)
  return [...baseProblems].reverse().map(p => ({
    title: p.title || "",
    round: p.round,
    turn: p.turn,
    seatWind: p.seatWind,
    condition: p.condition || "",
    melds: p.melds || "",
    doraIndicator: p.doraIndicator,
    hand: p.hand,
    answer: p.answer,
    explanationLink: p.explanationLink || "",
    explanation: p.explanation || "",
    isFavorite: !!p.isFavorite,
  }));
}
async function copyAllJson(){
  const text = JSON.stringify(exportJsonArrayForUser(), null, 2);
  try{
    await navigator.clipboard.writeText(text);
    alert("전체 JSON을 클립보드에 복사했어.");
  }catch{
    prompt("복사가 막혔어. 아래를 복사해줘:", text);
  }
}
function downloadAllJson(){
  const text = JSON.stringify(exportJsonArrayForUser(), null, 2);
  const blob = new Blob([text], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nanikiru_problems.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function copyCurrentJsonFromForm(){
  const obj = {
    title: $("fTitle").value.trim(),
    round: $("fRound").value,
    turn: parseInt($("fTurn").value, 10) || 1,
    seatWind: $("fSeatWind").value,
    condition: $("fCondition").value.trim(),
    melds: $("fMelds").value.trim(),
    doraIndicator: $("fDora").value.trim(),
    hand: $("fHand").value.trim(),
    answer: $("fAnswer").value.trim(),
    explanationLink: $("fLink").value.trim(),
    explanation: $("fExplanation").value,
    isFavorite: false
  };
  const text = JSON.stringify(obj, null, 2);
  try{
    await navigator.clipboard.writeText(text);
    alert("현재 입력중인 내용을 단일 JSON으로 복사했어.");
  }catch{
    prompt("복사가 막혔어. 아래를 복사해줘:", text);
  }
}


/* ===== Modal field validation ===== */
function validateMeldFieldUI(silent=false){
  const el = $("fMelds");
  if(!el) return true;
  const raw = el.value.trim();
  if(!raw){
    el.classList.remove("invalid");
    el.title = "";
    return true;
  }
  try{
    parseMeldList(raw);
    el.classList.remove("invalid");
    el.title = "";
    return true;
  }catch(e){
    el.classList.add("invalid");
    el.title = e.message || "후로 형식 오류";
    if(!silent) alert("후로 오류: " + (e.message || "형식/종류를 확인해줘."));
    return false;
  }
}

/* ===== Keyboard ===== */
function isTypingInInput(){
  const el = document.activeElement;
  if(!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
window.addEventListener("keydown", (e)=>{
  const modalOpen = $("modalOverlay")?.classList.contains("show");
  if(modalOpen) return;
  if(isTypingInInput()) return;

  if(e.key === "Enter"){
    if($("btnReveal") && !$("btnReveal").disabled){
      e.preventDefault();
      attemptReveal();
    }
  }
  if(e.key === "PageDown"){
    const btn = $("btnNext");
    if(btn && !btn.disabled){ e.preventDefault(); btn.click(); }
  }
  if(e.key === "PageUp"){
    const btn = $("btnPrev");
    if(btn && !btn.disabled){ e.preventDefault(); btn.click(); }
  }
  if(e.key === "ArrowLeft" || e.key === "ArrowRight"){
    if(revealed) return;
    const btns = [...$("tiles").querySelectorAll(".tileBtn")];
    if(btns.length === 0) return;

    if(selectedIndex === null) selectedIndex = btns.length - 1;

    if(e.key === "ArrowLeft") selectedIndex = Math.max(0, selectedIndex - 1);
    if(e.key === "ArrowRight") selectedIndex = Math.min(btns.length - 1, selectedIndex + 1);

    selected = btns[selectedIndex]?.dataset.tile || selected;
    highlightSelectedTile();
    e.preventDefault();
  }
});

/* ===== Selection safety ===== */
function ensureCurrentStillSelectable(){
  const cur = history[idx] || null;
  const activeBase = getActiveBaseList();

  if(activeBase.length === 0){
    history = [];
    idx = -1;
    setCardEmpty();
    return;
  }

  if(!cur){
    rebuildQuizPool();
    const q = shuffleOn()
      ? pickRandom(getActivePoolForShuffle(), null)
      : {...activeBase[0], _isVariant:false};
    history = [q];
    idx = 0;
    renderCurrent();
    return;
  }

  const curBaseId = baseIdOf(cur);
  const exists = activeBase.some(p => p.id === curBaseId);
  if(!exists){
    rebuildQuizPool();
    const q = shuffleOn()
      ? pickRandom(getActivePoolForShuffle(), null)
      : {...activeBase[0], _isVariant:false};
    history = [q];
    idx = 0;
    renderCurrent();
  }
}

/* ===== Init ===== */
function init(){
  const turnSel = $("fTurn");
  for(let i=1;i<=18;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i}순`;
    turnSel.appendChild(opt);
  }
  turnSel.value = "1";

  $("btnOpenAdd").addEventListener("click", ()=>{ resetAddForm(); openModal(); });
  $("btnCloseModal").addEventListener("click", closeModal);
  $("btnCancelModal").addEventListener("click", closeModal);
  $("modalOverlay").addEventListener("click", (e)=>{ if(e.target === $("modalOverlay")) closeModal(); });
  window.addEventListener("keydown", (e)=>{ if(e.key === "Escape" && $("modalOverlay").classList.contains("show")) closeModal(); });

  $("btnSave").addEventListener("click", saveFromForm);
  $("btnCopyCurrentJsonInModal").addEventListener("click", copyCurrentJsonFromForm);

  $("fMelds").addEventListener("blur", ()=>validateMeldFieldUI(false));

  $("btnBulkImport").addEventListener("click", ()=>{
    const txt = $("bulkJsonText").value.trim();
    if(!txt){ alert("JSON을 붙여넣거나 파일을 첨부해줘."); return; }
    importFromText(txt);
    $("bulkJsonText").value = "";
    closeModal();
  });

  $("btnAttachJson").addEventListener("click", ()=>{ $("jsonFileInput").click(); });
  $("jsonFileInput").addEventListener("change", async ()=>{
    const f = $("jsonFileInput").files?.[0];
    if(!f) return;
    try{
      const text = await f.text();
      $("bulkJsonText").value = text;
      alert("파일을 불러왔어. ‘일괄 추가’ 또는 ‘저장’을 누르면 반영돼.");
    }catch{
      alert("파일 읽기 실패");
    }finally{
      $("jsonFileInput").value = "";
    }
  });

  $("btnCopyAllJsonMain").addEventListener("click", copyAllJson);
  $("btnDownloadAllJsonMain").addEventListener("click", downloadAllJson);

  $("btnClearAll").addEventListener("click", ()=>{
    if(!confirm("정말 전체 삭제할까? (되돌리기 어려움)")) return;
    baseProblems = [];
    saveBaseProblems(baseProblems);
    setStats();
    renderProblemList();
    history = [];
    idx = -1;
    setCardEmpty();
  });

  $("btnReveal").addEventListener("click", attemptReveal);
  $("btnNext").addEventListener("click", nextByMode);
  $("btnPrev").addEventListener("click", prev);

  $("btnFavInCard").addEventListener("click", ()=>{
    const q = history[idx];
    const ref = getBaseProblemRefFromAny(q);
    if(!ref) return;
    ref.isFavorite = !ref.isFavorite;
    saveBaseProblems(baseProblems);
    setStats();
    renderProblemList();
    syncCardFavoriteButton();
    ensureCurrentStillSelectable();
  });

  $("toggleShuffle").addEventListener("change", ()=>{ ensureCurrentStillSelectable(); });
  $("toggleFavOnly").addEventListener("change", ()=>{ ensureCurrentStillSelectable(); });

  setStats();
  renderProblemList();
  setCardEmpty();

  if(baseProblems.length > 0){
    ensureCurrentStillSelectable();
  }
}
init();