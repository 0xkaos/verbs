"use strict";

const DATA_URL = "verbs.canonical.json";
const BINYAN_ORDER = ["Paal", "Nifal", "Piel", "Pual", "Hifil", "Hufal", "Hitpael"];
const BINYAN_HEBREW = {
  Paal: "פָּעַל", Nifal: "נִפְעַל", Piel: "פִּעֵל", Pual: "פֻּעַל",
  Hifil: "הִפְעִיל", Hufal: "הֻפְעַל", Hitpael: "הִתְפַּעֵל",
};
const TENSES = [
  ["present", "Present"], ["past", "Past"], ["future", "Future"],
  ["imperative", "Imperative"], ["infinitive", "Infinitive"],
];
const PRONOUN_ORDER = {
  past: ["אני", "אתה", "את", "הוא", "היא", "אנחנו", "אתם", "אתן", "הם", "הן"],
  present: ["אני", "אתה", "את", "הוא", "היא", "אנחנו", "אתם", "אתן", "הם", "הן"],
  future: ["אני", "אתה", "את", "הוא", "היא", "אנחנו", "אתם", "אתן", "הם", "הן"],
  imperative: ["אתה", "את", "אתם", "אתן"],
  infinitive: [""],
};
const HEBREW_FONTS = {
  NotoSerif: '"Noto Serif Hebrew", "Times New Roman", serif',
  NotoSans: '"Noto Sans Hebrew", Arial, sans-serif',
  FrankRuehl: '"Frank Ruehl", "Noto Serif Hebrew", serif',
  Dorian: '"Dorian", "Noto Serif Hebrew", serif',
  KtavYad: '"Ktav Yad", "Noto Serif Hebrew", cursive',
  DanaYad: '"Dana Yad", "Noto Serif Hebrew", cursive',
  GveretLevin: '"Gveret Levin", "Noto Serif Hebrew", cursive',
  NotoRashi: '"Noto Rashi Hebrew", "Noto Serif Hebrew", serif',
  KetefHinnom: '"Ketef Hinnom", "Noto Serif Hebrew", serif',
  PaleoHebrew: '"Paleo Hebrew", "Noto Serif Hebrew", serif',
  ProtoSinaitic: '"Proto Sinaitic", "Noto Serif Hebrew", serif',
};

const state = {
  verbs: {}, entries: [], roots: [], selectedRoot: null,
  selectedBinyan: null, selectedKey: null, tense: "present", searchIndex: 0,
  voice: "Tamar", sizeTarget: "hebrew",
};
const elements = {};
const hebrewCollator = new Intl.Collator("he");
let activeAudio = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  restorePreferences();
  bindGlobalEvents();
  renderTenseTabs();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.verbs = await response.json();
    prepareIndex();
    renderVoiceOptions();
    selectInitialRoot();
  } catch (error) {
    console.error("Unable to load canonical verb data", error);
    elements.conjugationBody.innerHTML = `<tr><td colspan="6" class="empty-state">Could not load <code>${DATA_URL}</code>. When viewing locally, serve this folder over HTTP rather than opening the file directly.</td></tr>`;
  }
}

function cacheElements() {
  const ids = [
    "root-search", "root-results", "selected-root",
    "root-position", "verb-binyan-label", "verb-infinitive", "verb-meaning",
    "verb-facts", "root-meaning",
    "translation-chips", "binyan-tabs", "lemma-tabs", "tense-tabs", "conjugation-body",
    "voice-select", "hebrew-font-select", "size-target",
    "table-note", "examples-section", "examples-list", "notes-section", "notes-text",
    "binyanim-section", "binyanim-body", "related-section", "related-list",
    "similar-section", "similar-list", "idioms-section", "idioms-list", "theme-toggle",
    "highlight-toggle", "font-decrease", "font-increase", "example-popover",
  ];
  for (const id of ids) elements[toCamel(id)] = document.getElementById(id);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function restorePreferences() {
  const storedTheme = localStorage.getItem("verb-atlas-theme");
  const dark = storedTheme === "dark" || (!storedTheme && matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("dark", dark);
  elements.themeToggle.setAttribute("aria-pressed", String(dark));

  const highlights = localStorage.getItem("verb-atlas-highlights") !== "false";
  document.body.classList.toggle("no-root-highlights", !highlights);
  elements.highlightToggle.setAttribute("aria-pressed", String(highlights));

  const pageScale = clamp(Number(localStorage.getItem("verb-atlas-scale")) || 1, .85, 1.25);
  const hebrewScale = clamp(Number(localStorage.getItem("verb-atlas-hebrew-scale")) || 1, .8, 1.35);
  document.documentElement.style.setProperty("--font-scale", pageScale);
  document.documentElement.style.setProperty("--hebrew-scale", hebrewScale);
  const font = localStorage.getItem("verb-atlas-hebrew-font") || "NotoSerif";
  elements.hebrewFontSelect.value = HEBREW_FONTS[font] ? font : "NotoSerif";
  applyHebrewFont(elements.hebrewFontSelect.value);
  state.sizeTarget = localStorage.getItem("verb-atlas-size-target") === "page" ? "page" : "hebrew";
  elements.sizeTarget.value = state.sizeTarget;
  updateSizeControls();
  state.voice = localStorage.getItem("verb-atlas-voice") || "Tamar";
}

function bindGlobalEvents() {
  elements.rootSearch.addEventListener("input", () => {
    state.searchIndex = 0;
    renderSearchResults(elements.rootSearch.value);
  });
  elements.rootSearch.addEventListener("focus", () => renderSearchResults(elements.rootSearch.value));
  elements.rootSearch.addEventListener("keydown", handleSearchKeys);

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !isTextInput(event.target)) {
      event.preventDefault();
      elements.rootSearch.focus();
    }
    if (event.key === "Escape") closeOverlays();
  });
  document.addEventListener("click", (event) => {
    if (!elements.rootResults.contains(event.target) && event.target !== elements.rootSearch) closeSearchResults();
    if (!elements.examplePopover.hidden &&
        !elements.examplePopover.contains(event.target) &&
        !event.target.closest(".example-button")) closePopover();
  });

  elements.themeToggle.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", dark);
    elements.themeToggle.setAttribute("aria-pressed", String(dark));
    localStorage.setItem("verb-atlas-theme", dark ? "dark" : "light");
  });
  elements.highlightToggle.addEventListener("click", () => {
    const enabled = document.body.classList.contains("no-root-highlights");
    document.body.classList.toggle("no-root-highlights", !enabled);
    elements.highlightToggle.setAttribute("aria-pressed", String(enabled));
    localStorage.setItem("verb-atlas-highlights", String(enabled));
  });
  elements.fontDecrease.addEventListener("click", () => adjustScale(-.05));
  elements.fontIncrease.addEventListener("click", () => adjustScale(.05));
  elements.hebrewFontSelect.addEventListener("change", () => {
    applyHebrewFont(elements.hebrewFontSelect.value);
    localStorage.setItem("verb-atlas-hebrew-font", elements.hebrewFontSelect.value);
  });
  elements.sizeTarget.addEventListener("change", () => {
    state.sizeTarget = elements.sizeTarget.value;
    localStorage.setItem("verb-atlas-size-target", state.sizeTarget);
    updateSizeControls();
  });
  elements.voiceSelect.addEventListener("change", () => {
    state.voice = elements.voiceSelect.value;
    localStorage.setItem("verb-atlas-voice", state.voice);
    renderVerb();
  });
  elements.examplePopover.querySelector(".popover-close").addEventListener("click", closePopover);
}

function prepareIndex() {
  state.entries = Object.entries(state.verbs).map(([key, verb]) => ({
    key, verb, root: normalizedRoot(verb.root),
  }));
  const rootMap = new Map();
  for (const entry of state.entries) {
    if (!rootMap.has(entry.root)) rootMap.set(entry.root, []);
    rootMap.get(entry.root).push(entry);
  }
  state.roots = [...rootMap.entries()].map(([root, entries]) => ({
    root,
    entries: entries.sort(compareEntries),
    searchText: normalizeSearch([
      root,
      ...entries.flatMap(({ verb }) => [
        verb.infinitive, ...(verb.meaning || []), ...Object.values(verb.translations || {}),
      ]),
    ].join(" ")),
  })).sort((a, b) => hebrewCollator.compare(a.root, b.root));
}

function compareEntries(a, b) {
  const order = BINYAN_ORDER.indexOf(a.verb.binyan_en) - BINYAN_ORDER.indexOf(b.verb.binyan_en);
  return order || hebrewCollator.compare(stripMarks(a.verb.infinitive), stripMarks(b.verb.infinitive));
}

function renderVoiceOptions() {
  const voices = new Set();
  for (const { verb } of state.entries) {
    for (const forms of Object.values(verb.conjugations || {})) {
      for (const form of forms) {
        for (const field of [form.audio, form.audio_example]) {
          if (typeof field === "string") voices.add("Tamar");
          else if (field && typeof field === "object") Object.keys(field).forEach((voice) => voices.add(voice));
        }
      }
    }
  }
  const ordered = ["Tamar", "Doron", ...voices].filter((voice, index, all) => voices.has(voice) && all.indexOf(voice) === index);
  if (!ordered.includes(state.voice)) state.voice = ordered[0] || "Tamar";
  elements.voiceSelect.replaceChildren();
  for (const voice of ordered) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = voice;
    option.selected = voice === state.voice;
    elements.voiceSelect.append(option);
  }
  elements.voiceSelect.disabled = ordered.length < 2;
}

function selectInitialRoot() {
  const initial = state.roots.find(({ root }) => root === "למד") || state.roots[0];
  if (initial) selectRoot(initial.root);
}

function selectRoot(root) {
  const record = state.roots.find((item) => item.root === root);
  if (!record) return;
  state.selectedRoot = root;
  const available = availableBinyanim(record.entries);
  state.selectedBinyan = available.includes(state.selectedBinyan) ? state.selectedBinyan : available[0];
  selectDefaultLemma(record.entries);
  elements.rootSearch.value = "";
  closeSearchResults();
  renderAll();
}

function selectDefaultLemma(entries) {
  const matching = entries.filter(({ verb }) => verb.binyan_en === state.selectedBinyan);
  state.selectedKey = matching.some(({ key }) => key === state.selectedKey) ? state.selectedKey : matching[0]?.key || null;
}

function availableBinyanim(entries) {
  const found = new Set(entries.map(({ verb }) => verb.binyan_en));
  return BINYAN_ORDER.filter((name) => found.has(name));
}

function renderAll() {
  const record = state.roots.find(({ root }) => root === state.selectedRoot);
  if (!record) return;
  elements.selectedRoot.textContent = displayRoot(record.entries[0].verb.root);
  elements.rootPosition.textContent = `${state.roots.indexOf(record) + 1} of ${state.roots.length} roots`;
  renderBinyanTabs(record.entries);
  renderLemmaTabs(record.entries);
  renderVerb();
}

function renderBinyanTabs(entries) {
  elements.binyanTabs.replaceChildren();
  for (const binyan of availableBinyanim(entries)) {
    const button = makeButton("tab-button", `${binyan} `);
    const hebrew = document.createElement("small");
    hebrew.dir = "rtl";
    hebrew.textContent = BINYAN_HEBREW[binyan] || "";
    button.append(hebrew);
    button.classList.toggle("active", binyan === state.selectedBinyan);
    button.setAttribute("aria-pressed", String(binyan === state.selectedBinyan));
    button.addEventListener("click", () => {
      state.selectedBinyan = binyan;
      selectDefaultLemma(entries);
      renderAll();
    });
    elements.binyanTabs.append(button);
  }
}

function renderLemmaTabs(entries) {
  const choices = entries.filter(({ verb }) => verb.binyan_en === state.selectedBinyan);
  elements.lemmaTabs.hidden = choices.length < 2;
  elements.lemmaTabs.replaceChildren();
  for (const { key, verb } of choices) {
    const button = makeButton("lemma-button", `${verb.infinitive} · ${(verb.meaning || []).join(", ")}`);
    button.classList.toggle("active", key === state.selectedKey);
    button.addEventListener("click", () => { state.selectedKey = key; renderVerb(); });
    elements.lemmaTabs.append(button);
  }
}

function renderVerb() {
  const verb = state.verbs[state.selectedKey];
  if (!verb) return;
  elements.verbBinyanLabel.textContent = `${verb.binyan_en} · ${verb.binyan}`;
  elements.verbInfinitive.innerHTML = highlightRoots(verb.infinitive, verb.root);
  const infinitiveAudio = resolveAudio(verb.conjugations?.infinitive?.[0]?.audio);
  elements.verbInfinitive.disabled = !infinitiveAudio;
  elements.verbInfinitive.setAttribute("aria-label", `Play ${verb.infinitive}`);
  elements.verbInfinitive.onclick = infinitiveAudio ? () => playAudio(infinitiveAudio) : null;
  elements.verbMeaning.textContent = (verb.meaning || []).join(" · ") || "Meaning unavailable";
  renderFacts(verb);
  renderTranslations(verb);
  renderTenseTabs(verb);
  renderConjugations(verb);
  renderDetails(verb);
}

function renderFacts(verb) {
  elements.verbFacts.replaceChildren();
  for (const value of [verb.frequency && `${verb.frequency} frequency`, verb.difficulty]) {
    if (!value) continue;
    const fact = document.createElement("span");
    fact.className = "verb-fact";
    fact.textContent = value;
    elements.verbFacts.append(fact);
  }
  elements.rootMeaning.textContent = verb.root_meaning || "";
}

function renderTranslations(verb) {
  elements.translationChips.replaceChildren();
  for (const [language, translation] of Object.entries(verb.translations || {})) {
    const chip = document.createElement("span");
    chip.className = "translation-chip";
    const code = document.createElement("strong");
    code.textContent = language;
    chip.append(code, ` ${translation}`);
    elements.translationChips.append(chip);
  }
}

function renderTenseTabs(verb = state.verbs[state.selectedKey]) {
  elements.tenseTabs.replaceChildren();
  for (const [tense, label] of TENSES) {
    const button = makeButton("tab-button", label);
    button.disabled = !verb?.conjugations?.[tense]?.length;
    button.classList.toggle("active", tense === state.tense);
    button.setAttribute("aria-pressed", String(tense === state.tense));
    button.addEventListener("click", () => {
      state.tense = tense;
      renderTenseTabs(verb);
      renderConjugations(verb);
    });
    elements.tenseTabs.append(button);
  }
}

function renderConjugations(verb) {
  closePopover();
  const forms = [...(verb.conjugations?.[state.tense] || [])];
  forms.sort((a, b) => pronounRank(a.pronoun, state.tense) - pronounRank(b.pronoun, state.tense));
  elements.conjugationBody.replaceChildren();
  if (!forms.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6" class="empty-state">No forms available for this tense.</td>';
    elements.conjugationBody.append(row);
    return;
  }
  for (const form of forms) elements.conjugationBody.append(makeFormRow(form, verb));
  elements.tableNote.textContent = state.tense === "future" || state.tense === "imperative"
    ? "In everyday modern Hebrew, ordinary plural forms commonly replace distinct feminine-plural forms."
    : "Select Example for the form in context. Select an underlined Hebrew form to play available audio.";
}

function makeFormRow(form, verb) {
  const row = document.createElement("tr");
  appendCell(row, form.pronoun || "—", "pronoun", "rtl");
  const hebrewCell = appendCell(row, "", "hebrew-form", "rtl");
  const formAudio = resolveAudio(form.audio);
  if (formAudio) {
    const button = document.createElement("button");
    button.className = "form-audio";
    button.type = "button";
    button.title = "Play pronunciation";
    button.setAttribute("aria-label", `Play ${form.transliteration || "verb form"}`);
    button.innerHTML = highlightRoots(form.form, verb.root);
    button.addEventListener("click", () => playAudio(formAudio));
    hebrewCell.append(button);
  } else {
    hebrewCell.innerHTML = highlightRoots(form.form, verb.root);
  }
  appendCell(row, form.transliteration || "—", "transliteration");
  appendCell(row, form.phonetics || "—", "phonetics");
  appendCell(row, form.translation || "—", "english-gloss");
  const actions = appendCell(row, "", "row-actions");
  const hasExample = Boolean(form.example_sentence_he || form.example_sentence_en);
  const exampleButton = makeButton("audio-button example-button", "Example");
  exampleButton.disabled = !hasExample;
  if (hasExample) exampleButton.addEventListener("click", (event) => showExample(form, event.currentTarget));
  actions.append(exampleButton);
  return row;
}

function appendCell(row, text, className = "", direction = "") {
  const cell = document.createElement("td");
  cell.className = className;
  if (direction) cell.dir = direction;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderDetails(verb) {
  renderExamples(verb.examples || []);
  toggleTextSection(elements.notesSection, elements.notesText, verb.notes);
  renderBinyanimDetails(verb.binyanim || {});
  renderTagSection(elements.relatedSection, elements.relatedList, verb.related_words || []);
  renderTagSection(elements.similarSection, elements.similarList, verb.similar_verbs || []);
  renderIdioms(verb.idioms || []);
}

function renderExamples(examples) {
  elements.examplesSection.hidden = examples.length === 0;
  elements.examplesList.replaceChildren();
  for (const example of examples) {
    const card = document.createElement("div");
    card.className = "example";
    const audio = resolveAudio(example.audio);
    if (audio) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "example__hebrew text-audio";
      button.dir = "rtl";
      button.textContent = example.hebrew;
      button.setAttribute("aria-label", `Play example: ${example.hebrew}`);
      button.addEventListener("click", () => playAudio(audio));
      card.append(button);
    } else {
      appendParagraph(card, example.hebrew, "example__hebrew", "rtl");
    }
    appendParagraph(card, example.transliteration, "example__transliteration");
    appendParagraph(card, example.translation, "example__translation");
    elements.examplesList.append(card);
  }
}

function renderBinyanimDetails(binyanim) {
  const records = Object.entries(binyanim).sort(([a], [b]) =>
    BINYAN_ORDER.indexOf(canonicalBinyan(a)) - BINYAN_ORDER.indexOf(canonicalBinyan(b))
  );
  elements.binyanimSection.hidden = records.length === 0;
  elements.binyanimBody.replaceChildren();
  for (const [name, data] of records) {
    if (!data || typeof data !== "object") continue;
    const row = document.createElement("tr");
    appendCell(row, canonicalBinyan(name));
    appendCell(row, data.infinitive || "—", "", "rtl");
    appendCell(row, [...(data.meaning || []), data.note].filter(Boolean).join(" · ") || "—");
    elements.binyanimBody.append(row);
  }
}

function renderTagSection(section, list, values) {
  section.hidden = values.length === 0;
  list.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
}

function renderIdioms(idioms) {
  elements.idiomsSection.hidden = idioms.length === 0;
  elements.idiomsList.replaceChildren();
  for (const idiom of idioms) {
    const card = document.createElement("div");
    card.className = "idiom";
    appendParagraph(card, idiom.expression, "idiom__hebrew", "rtl");
    appendParagraph(card, idiom.transliteration, "idiom__transliteration");
    appendParagraph(card, idiom.translation, "idiom__translation");
    appendParagraph(card, idiom.usage, "idiom__usage", "rtl");
    elements.idiomsList.append(card);
  }
}

function appendParagraph(parent, text, className, direction = "") {
  if (!text) return;
  const paragraph = document.createElement("p");
  paragraph.className = className;
  if (direction) paragraph.dir = direction;
  paragraph.textContent = text;
  parent.append(paragraph);
}

function toggleTextSection(section, target, text) {
  section.hidden = !text;
  target.textContent = text || "";
}

function renderSearchResults(query = "") {
  const normalizedQuery = normalizeSearch(query.trim());
  const matches = state.roots.filter(({ searchText }) => !normalizedQuery || searchText.includes(normalizedQuery)).slice(0, 60);
  elements.rootResults.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = "No matching root, infinitive, or meaning.";
    elements.rootResults.append(empty);
  }
  matches.forEach((record, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.setAttribute("role", "option");
    button.classList.toggle("active", index === state.searchIndex);
    button.innerHTML = `<span class="search-result__root" dir="rtl">${escapeHTML(displayRoot(record.entries[0].verb.root))}</span><span class="search-result__meaning">${escapeHTML(rootSummary(record.entries))}</span><span class="search-result__count">${record.entries.length} ${record.entries.length === 1 ? "verb" : "verbs"}</span>`;
    button.addEventListener("click", () => selectRoot(record.root));
    elements.rootResults.append(button);
  });
  elements.rootResults.hidden = false;
  elements.rootSearch.setAttribute("aria-expanded", "true");
}

function rootSummary(entries) {
  return [...new Set(entries.flatMap(({ verb }) => verb.meaning || []))].slice(0, 4).join(" · ");
}

function handleSearchKeys(event) {
  let options = [...elements.rootResults.querySelectorAll(".search-result")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (elements.rootResults.hidden) {
      renderSearchResults(elements.rootSearch.value);
      options = [...elements.rootResults.querySelectorAll(".search-result")];
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    state.searchIndex = clamp(state.searchIndex + direction, 0, Math.max(0, options.length - 1));
    options.forEach((option, index) => option.classList.toggle("active", index === state.searchIndex));
    options[state.searchIndex]?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter" && options.length) {
    event.preventDefault();
    options[state.searchIndex]?.click();
  } else if (event.key === "Escape") {
    closeSearchResults();
    elements.rootSearch.blur();
  }
}

function closeSearchResults() {
  elements.rootResults.hidden = true;
  elements.rootSearch.setAttribute("aria-expanded", "false");
}

function showExample(form, anchor) {
  const popover = elements.examplePopover;
  const hebrewButton = popover.querySelector(".popover-hebrew");
  hebrewButton.textContent = form.example_sentence_he || "";
  popover.querySelector(".popover-english").textContent = form.example_sentence_en || "";
  const exampleAudio = resolveAudio(form.audio_example);
  hebrewButton.disabled = !exampleAudio;
  hebrewButton.setAttribute("aria-label", `Play example: ${form.example_sentence_he || "Hebrew sentence"}`);
  hebrewButton.onclick = exampleAudio ? () => playAudio(exampleAudio) : null;
  popover.hidden = false;
  anchor.setAttribute("aria-expanded", "true");
}

function closePopover() {
  elements.examplePopover.hidden = true;
  document.querySelectorAll(".example-button[aria-expanded='true']").forEach((button) => button.removeAttribute("aria-expanded"));
}

function closeOverlays() { closeSearchResults(); closePopover(); }

function playAudio(source) {
  if (!source) return;
  activeAudio?.pause();
  activeAudio = new Audio(source);
  activeAudio.play().catch((error) => console.warn("Audio playback failed", error));
}

function resolveAudio(source) {
  if (typeof source === "string") return source;
  if (!source || typeof source !== "object") return null;
  return source[state.voice] || null;
}

function adjustScale(amount) {
  const hebrew = state.sizeTarget === "hebrew";
  const property = hebrew ? "--hebrew-scale" : "--font-scale";
  const storage = hebrew ? "verb-atlas-hebrew-scale" : "verb-atlas-scale";
  const limits = hebrew ? [.8, 1.35] : [.85, 1.25];
  const current = Number(getComputedStyle(document.documentElement).getPropertyValue(property)) || 1;
  const next = clamp(Math.round((current + amount) * 100) / 100, ...limits);
  document.documentElement.style.setProperty(property, next);
  localStorage.setItem(storage, String(next));
}

function applyHebrewFont(name) {
  document.documentElement.style.setProperty("--hebrew-font", HEBREW_FONTS[name] || HEBREW_FONTS.NotoSerif);
}

function updateSizeControls() {
  const label = state.sizeTarget === "hebrew" ? "Hebrew text" : "the whole page";
  elements.fontDecrease.title = `Decrease ${label} size`;
  elements.fontDecrease.setAttribute("aria-label", `Decrease ${label} size`);
  elements.fontIncrease.title = `Increase ${label} size`;
  elements.fontIncrease.setAttribute("aria-label", `Increase ${label} size`);
}

function pronounRank(pronoun, tense) {
  const rank = PRONOUN_ORDER[tense]?.indexOf(pronoun) ?? -1;
  return rank < 0 ? 99 : rank;
}

function canonicalBinyan(name) {
  const lowered = String(name).toLowerCase().replace(/[’']/g, "");
  return BINYAN_ORDER.find((item) => item.toLowerCase().replace(/[’']/g, "") === lowered) || name;
}

function normalizedRoot(rootLetters) { return rootLetters.map(normalizeLetter).join(""); }
function displayRoot(rootLetters) { return rootLetters.join(" · "); }

function normalizeLetter(value) {
  const finalForms = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  const bare = stripMarks(value);
  return finalForms[bare] || bare;
}

function stripMarks(value) {
  return String(value).normalize("NFD").replace(/[\u0591-\u05C7]/g, "").normalize("NFC");
}

function normalizeSearch(value) {
  return stripMarks(value).toLocaleLowerCase().replace(/[·.\-_'’]/g, " ").replace(/\s+/g, " ").trim();
}

// Retains the original site's ordered root matching, but groups each Hebrew
// letter with its niqqud and chooses the tightest match. This avoids coloring
// an infinitive prefix when it happens to repeat the first root letter.
function highlightRoots(form, rootLetters) {
  if (!form || !rootLetters || rootLetters.length < 2) return escapeHTML(form || "");
  const graphemes = segmentGraphemes(form);
  const consonants = [];
  graphemes.forEach((grapheme, index) => {
    const letter = stripMarks(grapheme).match(/[\u05D0-\u05EA]/)?.[0];
    if (letter) consonants.push({ index, letter: normalizeLetter(letter) });
  });
  const normalizedRootLetters = rootLetters.map(normalizeLetter);
  const matched = new Set(findBestRootMatch(consonants, normalizedRootLetters));
  return graphemes.map((grapheme, index) => matched.has(index)
    ? `<span class="root-letter">${escapeHTML(grapheme)}</span>`
    : escapeHTML(grapheme)).join("");
}

function findBestRootMatch(consonants, rootLetters) {
  let best = [];
  const consider = (candidate) => {
    if (!candidate.length) return;
    const span = candidate[candidate.length - 1] - candidate[0] + 1;
    const bestSpan = best.length ? best[best.length - 1] - best[0] + 1 : Infinity;
    if (candidate.length > best.length ||
        (candidate.length === best.length && span < bestSpan) ||
        (candidate.length === best.length && span === bestSpan && candidate[0] > best[0])) {
      best = [...candidate];
    }
  };
  const search = (rootIndex, consonantIndex, chosen) => {
    consider(chosen);
    if (rootIndex >= rootLetters.length || consonantIndex >= consonants.length) return;
    search(rootIndex + 1, consonantIndex, chosen);
    for (let index = consonantIndex; index < consonants.length; index += 1) {
      if (consonants[index].letter === rootLetters[rootIndex]) {
        search(rootIndex + 1, index + 1, [...chosen, consonants[index].index]);
      }
    }
  };
  search(0, 0, []);
  return best;
}

function segmentGraphemes(value) {
  if (Intl.Segmenter) return [...new Intl.Segmenter("he", { granularity: "grapheme" }).segment(value)].map(({ segment }) => segment);
  return Array.from(value.normalize("NFC"));
}

function makeButton(className, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function isTextInput(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; }
