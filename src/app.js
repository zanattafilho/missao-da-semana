import { firebaseConfig, firebaseOptions } from "./firebase-config.js";

const STORAGE_KEY = "missao-da-semana:v1";
const WEEKLY_BASE_VALUE = 50;
const SUCCESS_TARGET = 85;
const FIREBASE_SDK_VERSION = "12.7.0";

const tasks = [
  "Arrumar a cama",
  "Levar pratos e copos para a pia",
  "Guardar brinquedos",
  "Limpar o que sujou",
  "Organizar o quarto",
  "Separar roupa suja",
  "Cumprir combinados do dia"
];

const participants = {
  felipe: {
    id: "felipe",
    name: "Felipe",
    role: "filho",
    type: "child",
    color: "#35a7ff",
    avatar: "🧢"
  },
  antonela: {
    id: "antonela",
    name: "Antonela",
    role: "filha",
    type: "child",
    color: "#ff6fae",
    avatar: "🎀"
  },
  luiz: {
    id: "luiz",
    name: "Luiz",
    role: "pai",
    type: "parent",
    color: "#6fcb9f",
    avatar: "👨"
  },
  giovana: {
    id: "giovana",
    name: "Giovana",
    role: "mãe",
    type: "parent",
    color: "#ffb84d",
    avatar: "👩"
  }
};

const childIds = Object.values(participants)
  .filter((participant) => participant.type === "child")
  .map((participant) => participant.id);

const parentIds = Object.values(participants)
  .filter((participant) => participant.type === "parent")
  .map((participant) => participant.id);

const statusOptions = {
  done: { label: "Feita", short: "Feita", icon: "✓" },
  missed: { label: "Não feita", short: "Falhou", icon: "×" },
  na: { label: "Não se aplica", short: "N/A", icon: "-" }
};

const app = document.querySelector("#app");
let state = loadState();
let selectedWeekStart = state.currentWeekStart;
let editingOccurrenceId = null;
let cloud = {
  status: "local",
  message: "Salvando neste navegador",
  ref: null,
  setDoc: null,
  serverTimestamp: null,
  saveTimer: null,
  unsubscribe: null
};

function createEmptyWeek(weekStart) {
  const taskStatus = {};

  getWeekDays(weekStart).forEach((day) => {
    taskStatus[day.key] = {};
    childIds.forEach((childId) => {
      taskStatus[day.key][childId] = {};
      tasks.forEach((task) => {
        taskStatus[day.key][childId][task] = "missed";
      });
    });
  });

  return {
    weekStart,
    taskStatus,
    occurrences: [],
    closedAt: null
  };
}

function createInitialState() {
  const currentWeekStart = getWeekStart(new Date());
  const previousWeekStart = getDateKey(addDays(parseDateKey(currentWeekStart), -7));
  const currentWeek = createEmptyWeek(currentWeekStart);
  const previousWeek = createEmptyWeek(previousWeekStart);

  getWeekDays(currentWeekStart).forEach((day, dayIndex) => {
    childIds.forEach((childId) => {
      tasks.forEach((task, taskIndex) => {
        currentWeek.taskStatus[day.key][childId][task] =
          (dayIndex + taskIndex + childId.length) % 7 === 0 ? "na" : "done";
      });
    });
  });

  currentWeek.occurrences = [
    makeOccurrence("felipe", "child_bad_word", "Falou besteira na hora do videogame.", addHours(new Date(), -5)),
    makeOccurrence("luiz", "parent_bad_word", "Escapou um palavrão no trânsito.", addHours(new Date(), -2))
  ];

  getWeekDays(previousWeekStart).forEach((day, dayIndex) => {
    childIds.forEach((childId) => {
      tasks.forEach((task, taskIndex) => {
        previousWeek.taskStatus[day.key][childId][task] =
          (dayIndex + taskIndex) % 10 === 0 ? "missed" : "done";
      });
    });
  });
  previousWeek.occurrences = [
    makeOccurrence("giovana", "parent_bad_word", "Registro de exemplo.", addDays(new Date(previousWeekStart), 3))
  ];
  previousWeek.closedAt = new Date(addDays(previousWeekStart, 6)).toISOString();

  return {
    currentWeekStart,
    participants: clone(participants),
    weeks: {
      [currentWeekStart]: currentWeek,
      [previousWeekStart]: previousWeek
    },
    history: []
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createInitialState();

  try {
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

function normalizeState(savedState) {
  const currentWeekStart = savedState.currentWeekStart || getWeekStart(new Date());
  const normalized = {
    currentWeekStart,
    participants: { ...clone(participants), ...(savedState.participants || {}) },
    weeks: savedState.weeks || {},
    history: savedState.history || []
  };

  if (!normalized.weeks[currentWeekStart]) {
    normalized.weeks[currentWeekStart] = createEmptyWeek(currentWeekStart);
  }

  Object.values(normalized.weeks).forEach((week) => ensureWeekShape(week));
  return normalized;
}

function ensureWeekShape(week) {
  week.taskStatus ||= {};
  week.occurrences ||= [];

  getWeekDays(week.weekStart).forEach((day) => {
    week.taskStatus[day.key] ||= {};
    childIds.forEach((childId) => {
      week.taskStatus[day.key][childId] ||= {};
      tasks.forEach((task) => {
        week.taskStatus[day.key][childId][task] ||= "missed";
      });
    });
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function saveLocalOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig?.apiKey &&
      firebaseConfig?.projectId &&
      firebaseConfig?.appId &&
      firebaseOptions?.familyId
  );
}

async function initCloudSync() {
  if (!isFirebaseConfigured()) {
    cloud = {
      ...cloud,
      status: "local",
      message: "Firebase nao configurado"
    };
    render();
    return;
  }

  try {
    cloud = {
      ...cloud,
      status: "connecting",
      message: "Conectando ao Firebase..."
    };
    render();

    const [{ initializeApp }, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`)
    ]);
    const { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } = firestoreModule;
    const firebaseApp = initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    const ref = doc(db, "families", firebaseOptions.familyId, "app", "state");

    cloud = {
      ...cloud,
      status: "connecting",
      message: "Buscando dados da nuvem...",
      ref,
      setDoc,
      serverTimestamp
    };
    render();

    cloud.unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const remoteState = snapshot.data()?.state;
          if (remoteState) {
            state = normalizeState(remoteState);
            selectedWeekStart = state.currentWeekStart;
            saveLocalOnly();
          }
        } else {
          queueCloudSave(true);
        }

        cloud = {
          ...cloud,
          status: "online",
          message: "Sincronizado com Firebase"
        };
        render();
      },
      (error) => {
        cloud = {
          ...cloud,
          status: "error",
          message: `Firebase: ${error.message}`
        };
        render();
      }
    );
  } catch (error) {
    cloud = {
      ...cloud,
      status: "error",
      message: `Firebase: ${error.message}`
    };
    render();
  }
}

function queueCloudSave(immediate = false) {
  if (!cloud.ref || !cloud.setDoc) return;

  clearTimeout(cloud.saveTimer);
  const delay = immediate ? 0 : 700;
  cloud.saveTimer = setTimeout(async () => {
    try {
      cloud = {
        ...cloud,
        status: "saving",
        message: "Salvando na nuvem..."
      };
      render();

      await cloud.setDoc(
        cloud.ref,
        {
          state,
          updatedAt: cloud.serverTimestamp(),
          schemaVersion: 1
        },
        { merge: true }
      );

      cloud = {
        ...cloud,
        status: "online",
        message: "Sincronizado com Firebase"
      };
      render();
    } catch (error) {
      cloud = {
        ...cloud,
        status: "error",
        message: `Firebase: ${error.message}`
      };
      render();
    }
  }, delay);
}

function makeOccurrence(participantId, type, note = "", date = new Date()) {
  return {
    id: createId(),
    participantId,
    type,
    note,
    dateTime: new Date(date).toISOString()
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `occ-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWeekStart(date) {
  const input = new Date(date);
  input.setHours(0, 0, 0, 0);
  const day = input.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  input.setDate(input.getDate() + diff);
  return getDateKey(input);
}

function getWeekDays(weekStart) {
  const start = parseDateKey(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      key: getDateKey(date),
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", ""),
      dayNumber: date.getDate()
    };
  });
}

function getDateKey(date) {
  const safeDate = new Date(date);
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addHours(date, hours) {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDate(dateLike) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(dateLike));
}

function formatTime(dateLike) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateLike));
}

function getCurrentWeek() {
  if (!state.weeks[selectedWeekStart]) {
    state.weeks[selectedWeekStart] = createEmptyWeek(selectedWeekStart);
  }
  ensureWeekShape(state.weeks[selectedWeekStart]);
  return state.weeks[selectedWeekStart];
}

function getCalculations(week) {
  const calculations = {};
  const parentFines = week.occurrences.filter((occurrence) => parentIds.includes(occurrence.participantId)).length;

  childIds.forEach((childId) => {
    const allStatuses = getWeekDays(week.weekStart).flatMap((day) =>
      tasks.map((task) => week.taskStatus[day.key]?.[childId]?.[task] || "missed")
    );
    const validStatuses = allStatuses.filter((status) => status !== "na");
    const doneCount = validStatuses.filter((status) => status === "done").length;
    const percentage = validStatuses.length === 0 ? 100 : Math.round((doneCount / validStatuses.length) * 100);
    const achievedBase = percentage >= SUCCESS_TARGET;
    const childFines = week.occurrences.filter((occurrence) => occurrence.participantId === childId).length;
    const parentCredits = parentFines;
    const baseValue = achievedBase ? WEEKLY_BASE_VALUE : 0;
    const finalValue = Math.max(0, baseValue - childFines + parentCredits);

    calculations[childId] = {
      doneCount,
      validCount: validStatuses.length,
      percentage,
      achievedBase,
      baseValue,
      childFines,
      parentCredits,
      finalValue,
      medals: getMedals({ percentage, childFines, week, childId })
    };
  });

  return calculations;
}

function getMedals({ percentage, childFines, week, childId }) {
  const medals = [];
  if (percentage === 100) medals.push({ icon: "🏆", label: "Semana completa" });
  if (childFines === 0) medals.push({ icon: "🌟", label: "Nenhuma besteira" });

  const todayKey = getDateKey(new Date());
  if (week.taskStatus[todayKey]?.[childId]) {
    const todayStatuses = Object.values(week.taskStatus[todayKey][childId]);
    const valid = todayStatuses.filter((status) => status !== "na");
    if (valid.length > 0 && valid.every((status) => status === "done")) {
      medals.push({ icon: "🤝", label: "Ajudante do dia" });
    }
  }

  return medals;
}

function setTaskStatus(dayKey, childId, task, status) {
  const week = getCurrentWeek();
  week.taskStatus[dayKey][childId][task] = status;
  saveState();
  render();
}

function updateParticipantPhoto(participantId, file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    state.participants[participantId].photo = reader.result;
    saveState();
    render();
  };
  reader.readAsDataURL(file);
}

function addOccurrence(participantId, type, note = "") {
  const participant = state.participants[participantId];
  const confirmed = confirm(`Registrar ocorrência para ${participant.name}?`);
  if (!confirmed) return;

  const week = getCurrentWeek();
  week.occurrences.unshift(makeOccurrence(participantId, type, note.trim()));
  saveState();
  render();
}

function updateOccurrence(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const week = getCurrentWeek();
  const occurrence = week.occurrences.find((item) => item.id === editingOccurrenceId);
  if (!occurrence) return;

  occurrence.participantId = form.participantId.value;
  occurrence.type = form.type.value;
  occurrence.note = form.note.value.trim();
  occurrence.dateTime = new Date(`${form.date.value}T${form.time.value || "12:00"}`).toISOString();
  editingOccurrenceId = null;
  saveState();
  render();
}

function deleteOccurrence(id) {
  const week = getCurrentWeek();
  week.occurrences = week.occurrences.filter((occurrence) => occurrence.id !== id);
  editingOccurrenceId = null;
  saveState();
  render();
}

function undoLastOccurrence() {
  const week = getCurrentWeek();
  week.occurrences.shift();
  saveState();
  render();
}

function startNewWeek() {
  const newWeekStart = getWeekStart(addDays(parseDateKey(state.currentWeekStart), 7));
  if (!confirm(`Iniciar a semana de ${formatDate(newWeekStart)}?`)) return;

  state.weeks[state.currentWeekStart].closedAt ||= new Date().toISOString();
  state.currentWeekStart = newWeekStart;
  selectedWeekStart = newWeekStart;
  state.weeks[newWeekStart] ||= createEmptyWeek(newWeekStart);
  saveState();
  render();
}

function closeWeek() {
  const week = getCurrentWeek();
  week.closedAt = new Date().toISOString();
  saveState();
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `missao-da-semana-${getDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedState = normalizeState(JSON.parse(reader.result));
      state = importedState;
      selectedWeekStart = state.currentWeekStart;
      saveState();
      render();
    } catch {
      alert("Não foi possível importar este arquivo JSON.");
    }
  };
  reader.readAsText(file);
}

function resetExampleData() {
  if (!confirm("Restaurar os dados iniciais de exemplo?")) return;
  state = createInitialState();
  selectedWeekStart = state.currentWeekStart;
  saveState();
  render();
}

function getAllWeekStarts() {
  return Object.keys(state.weeks).sort((a, b) => b.localeCompare(a));
}

function occurrenceLabel(occurrence) {
  const participant = state.participants[occurrence.participantId];
  const text = parentIds.includes(occurrence.participantId) ? "falou palavrão" : "falou besteira";
  return `${participant.name} ${text}`;
}

function render() {
  const week = getCurrentWeek();
  const calculations = getCalculations(week);
  const weekDays = getWeekDays(week.weekStart);

  app.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Família em modo missão</p>
          <h1>Missão da Semana</h1>
          <p class="hero-copy">Tarefas, combinados e multas em uma rotina simples de segunda a domingo.</p>
        </div>
        <div class="hero-tools">
          <div class="sync-pill ${cloud.status}" title="${escapeHtml(cloud.message)}">
            <span></span>
            ${escapeHtml(cloud.message)}
          </div>
          <div class="week-switcher" aria-label="Selecionar semana">
            <label for="weekSelect">Semana</label>
            <select id="weekSelect">
              ${getAllWeekStarts()
                .map((weekStart) => `<option value="${weekStart}" ${weekStart === selectedWeekStart ? "selected" : ""}>${formatDate(weekStart)} a ${formatDate(addDays(parseDateKey(weekStart), 6))}</option>`)
                .join("")}
            </select>
          </div>
        </div>
      </header>

      <section class="participant-grid" aria-label="Participantes">
        ${Object.values(state.participants).map((participant) => renderParticipantCard(participant, calculations)).join("")}
      </section>

      <nav class="tabs" aria-label="Áreas do aplicativo">
        <a href="#tarefas">Tarefas</a>
        <a href="#ocorrencias">Ocorrências</a>
        <a href="#fechamento">Fechamento</a>
        <a href="#historico">Histórico</a>
      </nav>

      <section id="tarefas" class="panel tasks-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Calendário semanal</p>
            <h2>Tarefas de Felipe e Antonela</h2>
          </div>
          <div class="legend">
            ${Object.entries(statusOptions).map(([key, option]) => `<span class="legend-item ${key}">${option.icon} ${option.label}</span>`).join("")}
          </div>
        </div>
        <div class="calendar">
          ${weekDays.map((day) => renderDayColumn(day, week)).join("")}
        </div>
      </section>

      <section id="ocorrencias" class="panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Registro rápido</p>
            <h2>Palavrões e besteiras</h2>
          </div>
          <button class="ghost-button" ${week.occurrences.length ? "" : "disabled"} data-action="undo">Desfazer último</button>
        </div>
        <div class="quick-actions">
          <button class="quick-card blue" data-occurrence="felipe">Felipe falou besteira</button>
          <button class="quick-card pink" data-occurrence="antonela">Antonela falou besteira</button>
          <button class="quick-card green" data-occurrence="luiz">Luiz falou palavrão</button>
          <button class="quick-card yellow" data-occurrence="giovana">Giovana falou palavrão</button>
        </div>
        <label class="note-field" for="quickNote">Observação opcional para o próximo registro</label>
        <input id="quickNote" class="text-input" type="text" placeholder="Ex.: aconteceu durante o almoço" />
        <div class="occurrence-list">
          ${week.occurrences.length ? week.occurrences.map(renderOccurrence).join("") : `<p class="empty-state">Nenhuma ocorrência nesta semana.</p>`}
        </div>
      </section>

      <section id="fechamento" class="panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Resumo financeiro</p>
            <h2>Fechamento semanal</h2>
          </div>
          <div class="button-row">
            <button class="ghost-button" data-action="close-week">Marcar fechada</button>
            <button class="primary-button" data-action="new-week">Iniciar nova semana</button>
          </div>
        </div>
        <div class="closing-grid">
          ${childIds.map((childId) => renderClosingCard(childId, calculations[childId])).join("")}
        </div>
      </section>

      <section id="historico" class="panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Arquivo da casa</p>
            <h2>Histórico e dados</h2>
          </div>
          <div class="button-row">
            <button class="ghost-button" data-action="export">Exportar JSON</button>
            <label class="file-button">
              Importar JSON
              <input type="file" accept="application/json" data-action="import" />
            </label>
            <button class="ghost-button danger" data-action="reset">Dados de exemplo</button>
          </div>
        </div>
        <div class="history-list">
          ${getAllWeekStarts().map((weekStart) => renderHistoryItem(weekStart)).join("")}
        </div>
      </section>
    </main>
  `;

  bindEvents();
}

function renderParticipantCard(participant, calculations) {
  const calculation = calculations[participant.id];
  const balance = calculation ? calculation.finalValue : 0;
  const progress = calculation ? calculation.percentage : participant.type === "parent" ? 100 : 0;
  const photo = participant.photo
    ? `<img src="${participant.photo}" alt="Foto de ${participant.name}" />`
    : `<span>${participant.avatar}</span>`;

  return `
    <article class="participant-card" style="--accent: ${participant.color}">
      <div class="photo">${photo}</div>
      <div>
        <p class="role">${participant.role}</p>
        <h2>${participant.name}</h2>
        <strong>${participant.type === "child" ? formatCurrency(balance) : "Participante"}</strong>
      </div>
      <div class="progress" aria-label="Progresso de ${participant.name}">
        <span style="width: ${progress}%"></span>
      </div>
      <label class="photo-button">
        Alterar foto
        <input type="file" accept="image/*" data-photo="${participant.id}" />
      </label>
    </article>
  `;
}

function renderDayColumn(day, week) {
  return `
    <article class="day-column">
      <header>
        <span>${day.label}</span>
        <strong>${day.dayNumber}</strong>
      </header>
      ${childIds.map((childId) => renderChildDay(childId, day, week)).join("")}
    </article>
  `;
}

function renderChildDay(childId, day, week) {
  const participant = state.participants[childId];

  return `
    <div class="child-day">
      <h3>${participant.name}</h3>
      ${tasks.map((task) => {
        const status = week.taskStatus[day.key]?.[childId]?.[task] || "missed";
        return `
          <label class="task-row ${status}">
            <span>${task}</span>
            <select data-day="${day.key}" data-child="${childId}" data-task="${task}">
              ${Object.entries(statusOptions)
                .map(([key, option]) => `<option value="${key}" ${key === status ? "selected" : ""}>${option.short}</option>`)
                .join("")}
            </select>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderOccurrence(occurrence) {
  if (editingOccurrenceId === occurrence.id) {
    const date = new Date(occurrence.dateTime);
    return `
      <form class="occurrence-item edit" data-edit-form>
        <select name="participantId">
          ${Object.values(state.participants)
            .map((participant) => `<option value="${participant.id}" ${participant.id === occurrence.participantId ? "selected" : ""}>${participant.name}</option>`)
            .join("")}
        </select>
        <select name="type">
          <option value="child_bad_word" ${occurrence.type === "child_bad_word" ? "selected" : ""}>Besteira</option>
          <option value="parent_bad_word" ${occurrence.type === "parent_bad_word" ? "selected" : ""}>Palavrão</option>
        </select>
        <input type="date" name="date" value="${getDateKey(date)}" />
        <input type="time" name="time" value="${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}" />
        <input type="text" name="note" value="${escapeHtml(occurrence.note || "")}" placeholder="Observação" />
        <button class="primary-button" type="submit">Salvar</button>
        <button class="ghost-button" type="button" data-cancel-edit>Cancelar</button>
      </form>
    `;
  }

  return `
    <article class="occurrence-item">
      <div>
        <strong>${occurrenceLabel(occurrence)}</strong>
        <span>${formatDate(occurrence.dateTime)} às ${formatTime(occurrence.dateTime)}</span>
        ${occurrence.note ? `<p>${escapeHtml(occurrence.note)}</p>` : ""}
      </div>
      <div class="item-actions">
        <button class="icon-button" title="Editar ocorrência" data-edit="${occurrence.id}">✎</button>
        <button class="icon-button danger" title="Excluir ocorrência" data-delete="${occurrence.id}">×</button>
      </div>
    </article>
  `;
}

function renderClosingCard(childId, calculation) {
  const participant = state.participants[childId];

  return `
    <article class="closing-card">
      <div class="closing-head">
        <h3>${participant.name}</h3>
        <strong>${formatCurrency(calculation.finalValue)}</strong>
      </div>
      <div class="big-progress">
        <span style="width: ${calculation.percentage}%"></span>
      </div>
      <dl>
        <div><dt>Tarefas cumpridas</dt><dd>${calculation.percentage}% (${calculation.doneCount}/${calculation.validCount})</dd></div>
        <div><dt>Valor base</dt><dd>${formatCurrency(calculation.baseValue)}</dd></div>
        <div><dt>Descontos</dt><dd>- ${formatCurrency(calculation.childFines)}</dd></div>
        <div><dt>Créditos dos pais</dt><dd>+ ${formatCurrency(calculation.parentCredits)}</dd></div>
      </dl>
      <div class="medals">
        ${calculation.medals.length ? calculation.medals.map((medal) => `<span title="${medal.label}">${medal.icon} ${medal.label}</span>`).join("") : `<span>Sem medalhas ainda</span>`}
      </div>
    </article>
  `;
}

function renderHistoryItem(weekStart) {
  const week = state.weeks[weekStart];
  const calculations = getCalculations(week);

  return `
    <article class="history-item ${weekStart === selectedWeekStart ? "active" : ""}">
      <button data-week="${weekStart}">
        <strong>${formatDate(weekStart)} a ${formatDate(addDays(parseDateKey(weekStart), 6))}</strong>
        <span>${week.closedAt ? `Fechada em ${formatDate(week.closedAt)}` : "Em andamento"}</span>
      </button>
      <div>
        ${childIds.map((childId) => `<span>${state.participants[childId].name}: ${formatCurrency(calculations[childId].finalValue)}</span>`).join("")}
      </div>
    </article>
  `;
}

function bindEvents() {
  document.querySelector("#weekSelect").addEventListener("change", (event) => {
    selectedWeekStart = event.target.value;
    render();
  });

  document.querySelectorAll("[data-photo]").forEach((input) => {
    input.addEventListener("change", (event) => updateParticipantPhoto(event.target.dataset.photo, event.target.files[0]));
  });

  document.querySelectorAll("[data-day][data-child][data-task]").forEach((select) => {
    select.addEventListener("change", (event) => {
      setTaskStatus(event.target.dataset.day, event.target.dataset.child, event.target.dataset.task, event.target.value);
    });
  });

  document.querySelectorAll("[data-occurrence]").forEach((button) => {
    button.addEventListener("click", () => {
      const participantId = button.dataset.occurrence;
      const type = parentIds.includes(participantId) ? "parent_bad_word" : "child_bad_word";
      const note = document.querySelector("#quickNote").value;
      addOccurrence(participantId, type, note);
    });
  });

  document.querySelectorAll("[data-week]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedWeekStart = button.dataset.week;
      render();
      location.hash = "fechamento";
    });
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingOccurrenceId = button.dataset.edit;
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      if (confirm("Excluir esta ocorrência?")) deleteOccurrence(button.dataset.delete);
    });
  });

  document.querySelector("[data-action='undo']")?.addEventListener("click", undoLastOccurrence);
  document.querySelector("[data-action='new-week']")?.addEventListener("click", startNewWeek);
  document.querySelector("[data-action='close-week']")?.addEventListener("click", closeWeek);
  document.querySelector("[data-action='export']")?.addEventListener("click", exportData);
  document.querySelector("[data-action='reset']")?.addEventListener("click", resetExampleData);
  document.querySelector("[data-action='import']")?.addEventListener("change", (event) => importData(event.target.files[0]));
  document.querySelector("[data-edit-form]")?.addEventListener("submit", updateOccurrence);
  document.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
    editingOccurrenceId = null;
    render();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
initCloudSync();
