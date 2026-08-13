import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-functions.js";
import { allowedAdminEmail, firebaseConfig } from "./firebase-config.js";

const configured = !Object.values(firebaseConfig).some((value) =>
  String(value).startsWith("REPLACE_WITH_"),
);

const loginView = document.querySelector("#login-view");
const adminView = document.querySelector("#admin-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const staffEmail = document.querySelector("#staff-email");
const summaryError = document.querySelector("#summary-error");
const playersError = document.querySelector("#players-error");
const playerError = document.querySelector("#player-error");
const deleteError = document.querySelector("#delete-error");
const pmfError = document.querySelector("#pmf-error");
const pmfResponsesError = document.querySelector("#pmf-responses-error");
const playerDialog = document.querySelector("#player-dialog");
const deleteDialog = document.querySelector("#delete-dialog");

let auth;
let listPlayers;
let getSummary;
let getPlayer;
let updatePlayer;
let generateNewPlan;
let listAchievements;
let deleteUser;
let getPmfSummary;
let listPmfResponses;
let nextCursor = null;
let cachedAchievements = null;
let nextPmfCursor = null;
let activeFilters = {};
let selectedPlayerId = null;
let selectedPlayerUsername = "";
let selectedPlayerBirthDate = null;
let deletePendingUserId = null;
let deletePendingUsername = "";

const PMF_LABELS = {
  very: "Very disappointed",
  somewhat: "Somewhat disappointed",
  not: "Not disappointed",
};

const showError = (element, error) => {
  const code = typeof error?.code === "string" ? error.code : "";
  const details =
    typeof error?.details === "string"
      ? error.details
      : typeof error?.customData?.details === "string"
        ? error.customData.details
        : "";
  const rawMessage = typeof error?.message === "string" ? error.message : "";

  let message = "Something went wrong.";
  if (code === "functions/permission-denied") {
    message = "This account does not have the required admin permission.";
  } else if (details && details !== "INTERNAL") {
    message = details;
  } else if (rawMessage && rawMessage !== "INTERNAL") {
    message = rawMessage.replace(/^Firebase:\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim() || rawMessage;
  } else if (code.startsWith("functions/")) {
    message = `Admin request failed (${code.replace(/^functions\//, "")}). Try Refresh again.`;
  }

  element.textContent = message;
};

const setButtonBusy = (button, busy, busyText) => {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
};

const displayValue = (value) => {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const truncateText = (value, max = 80) => {
  if (!value) return "—";
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const renderDetails = (element, values) => {
  element.replaceChildren();
  Object.entries(values).forEach(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = displayValue(value);
    item.append(term, description);
    element.append(item);
  });
};

const renderStatCards = (containerId, cards) => {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.replaceChildren(
    ...cards
      .filter(([, value]) => value != null && value !== "")
      .map(([label, value, description]) => {
        const card = document.createElement("div");
        card.className = "stat";
        const strong = document.createElement("strong");
        const span = document.createElement("span");
        strong.textContent = displayValue(value);
        span.textContent = label;
        card.append(strong, span);
        if (description) {
          const hint = document.createElement("p");
          hint.className = "stat-description";
          hint.textContent = description;
          card.append(hint);
        }
        return card;
      }),
  );
};

const formatMetricValue = (metric) => {
  if (metric?.unit === "percent") {
    return metric.value == null ? "—" : `${metric.value}%`;
  }
  if (typeof metric?.value === "number") {
    return Number.isInteger(metric.value) ? String(metric.value) : String(metric.value);
  }
  return displayValue(metric?.value);
};

const renderMetricGroup = (group) => {
  const panel = document.createElement("section");
  panel.className = "panel metric-group";

  const heading = document.createElement("div");
  heading.className = "metric-group-heading";
  const title = document.createElement("h4");
  title.textContent = group?.title || "Metrics";
  const definition = document.createElement("p");
  definition.className = "metric-definition";
  definition.textContent = group?.definition || "";
  heading.append(title, definition);

  const grid = document.createElement("div");
  grid.className = "stat-grid compact";
  (group?.metrics || []).forEach((metric) => {
    const card = document.createElement("article");
    card.className = "stat";
    const strong = document.createElement("strong");
    strong.textContent = formatMetricValue(metric);
    const span = document.createElement("span");
    span.textContent = metric.label;
    const hint = document.createElement("p");
    hint.className = "stat-description";
    const rate =
      metric.ratePercent == null ? "" : ` (${metric.ratePercent}% rate)`;
    hint.textContent = `${metric.description || ""}${rate}`.trim();
    card.append(strong, span, hint);
    grid.append(card);
  });

  panel.append(heading, grid);
  return panel;
};

const renderPirateMetrics = (pirate) => {
  const container = document.querySelector("#pirate-metrics");
  const note = document.querySelector("#pirate-note");
  if (!container) return;
  if (note) note.textContent = pirate?.note || "";

  const groups = [
    pirate?.acquisition,
    pirate?.activation,
    pirate?.retention,
    pirate?.referral,
  ].filter(Boolean);

  container.replaceChildren(...groups.map(renderMetricGroup));
};

const renderOpsMetrics = (ops) => {
  const container = document.querySelector("#ops-metrics");
  if (!container) return;
  const groups = [ops?.tutorials, ops?.workoutCompletion, ops?.plansGenerated].filter(Boolean);
  container.replaceChildren(...groups.map(renderMetricGroup));
};

const renderSignupDropoff = (dropoff) => {
  const container = document.querySelector("#signup-dropoff");
  const note = document.querySelector("#signup-dropoff-note");
  if (!container) return;

  if (note) {
    const completion =
      dropoff?.completionRatePercent == null
        ? ""
        : ` Completion so far: ${dropoff.completionRatePercent}% (${displayValue(dropoff.completed)} / ${displayValue(dropoff.started)} started).`;
    note.textContent = `${dropoff?.definition || ""}${completion}`.trim();
  }

  const steps = dropoff?.steps || [];
  if (steps.length === 0 || steps.every((step) => !step.count)) {
    container.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent =
      "No signup step data yet. Counts appear after new players go through signup with funnel tracking enabled.";
    container.append(empty);
    return;
  }

  const max = Math.max(...steps.map((step) => step.count || 0), 1);
  container.replaceChildren(
    ...steps.map((step) => {
      const row = document.createElement("div");
      row.className = "funnel-step";

      const meta = document.createElement("div");
      meta.className = "funnel-meta";
      const label = document.createElement("span");
      label.className = "funnel-label";
      label.textContent = `${step.step}. ${step.label}`;
      const count = document.createElement("strong");
      count.className = "funnel-count";
      count.textContent = displayValue(step.count);
      meta.append(label, count);

      const track = document.createElement("div");
      track.className = "funnel-track";
      const fill = document.createElement("div");
      fill.className = "funnel-fill";
      fill.style.width = `${Math.max(((step.count || 0) / max) * 100, 2)}%`;
      track.append(fill);

      const rates = document.createElement("div");
      rates.className = "funnel-rates";
      const drop =
        step.dropOffFromPreviousPercent == null
          ? "—"
          : `${step.dropOffFromPreviousPercent}% dropped from previous`;
      const fromStart =
        step.conversionFromStartPercent == null
          ? "—"
          : `${step.conversionFromStartPercent}% of starts`;
      rates.textContent = `${drop} · ${fromStart}`;

      row.append(meta, track, rates);
      return row;
    }),
  );
};

const metricLabel = (metric, unit = "") => {
  if (!metric || metric.average == null) return null;
  const suffix = unit ? ` ${unit}` : "";
  return `${metric.average}${suffix}`;
};

const buildBarChart = (title, distribution, { limit = 0, sortByValue = true } = {}) => {
  const panel = document.createElement("div");
  panel.className = "panel chart-panel";
  const heading = document.createElement("h4");
  heading.textContent = title;
  panel.append(heading);

  const chart = document.createElement("div");
  chart.className = "bar-chart";

  let entries = Object.entries(distribution || {});
  if (sortByValue) entries.sort((a, b) => b[1] - a[1]);
  else entries.sort((a, b) => a[0].localeCompare(b[0]));
  if (limit > 0) entries = entries.slice(0, limit);

  const max = entries.reduce((acc, [, value]) => Math.max(acc, value), 0) || 1;

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No data";
    panel.append(empty);
    return panel;
  }

  entries.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const name = document.createElement("span");
    name.className = "bar-label";
    name.textContent = label;
    name.title = label;

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max((value / max) * 100, 2)}%`;
    track.append(fill);

    const count = document.createElement("span");
    count.className = "bar-value";
    count.textContent = String(value);

    row.append(name, track, count);
    chart.append(row);
  });

  panel.append(chart);
  return panel;
};

const renderTimeChart = (containerId, distribution) => {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.replaceChildren();
  const entries = Object.entries(distribution || {}).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const max = entries.reduce((acc, [, value]) => Math.max(acc, value), 0) || 1;
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No data";
    container.append(empty);
    return;
  }
  entries.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const name = document.createElement("span");
    name.className = "bar-label";
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max((value / max) * 100, 2)}%`;
    track.append(fill);
    const count = document.createElement("span");
    count.className = "bar-value";
    count.textContent = String(value);
    row.append(name, track, count);
    container.append(row);
  });
};

const renderActivationFunnel = (funnel) => {
  const container = document.querySelector("#activation-funnel");
  const note = document.querySelector("#funnel-note");
  if (!container) return;

  if (note) {
    note.textContent = funnel?.note || "";
  }

  const steps = funnel?.steps || [];
  if (steps.length === 0) {
    container.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No funnel data";
    container.append(empty);
    return;
  }

  const max = Math.max(...steps.map((step) => step.count || 0), 1);
  container.replaceChildren(
    ...steps.map((step, index) => {
      const row = document.createElement("div");
      row.className = "funnel-step";

      const meta = document.createElement("div");
      meta.className = "funnel-meta";

      const label = document.createElement("span");
      label.className = "funnel-label";
      label.textContent = `${index + 1}. ${step.label}`;

      const count = document.createElement("strong");
      count.className = "funnel-count";
      count.textContent = displayValue(step.count);

      meta.append(label, count);

      const track = document.createElement("div");
      track.className = "funnel-track";
      const fill = document.createElement("div");
      fill.className = "funnel-fill";
      fill.style.width = `${Math.max(((step.count || 0) / max) * 100, 2)}%`;
      track.append(fill);

      const rates = document.createElement("div");
      rates.className = "funnel-rates";
      const fromPrev =
        step.conversionFromPrevious == null
          ? "—"
          : `${step.conversionFromPrevious}% from previous`;
      const fromStart =
        step.conversionFromStart == null
          ? "—"
          : `${step.conversionFromStart}% of signups`;
      rates.textContent = `${fromPrev} · ${fromStart}`;

      row.append(meta, track, rates);
      return row;
    }),
  );
};

const callSummary = async () => {
  const button = document.querySelector("#refresh-summary");
  summaryError.textContent = "";
  setButtonBusy(button, true, "Loading…");
  try {
    const { data } = await getSummary({});

    const totals = data.totals || {
      totalPlayers: data.totalPlayers,
      activeWithin7Days: data.activeWithin7Days,
      completedPrograms: data.completedPrograms,
    };
    const metrics = data.metrics || {};
    const distributions = data.distributions || { byPosition: data.byPosition };
    const trends = data.trends || {};

    const generated = document.querySelector("#summary-generated");
    if (generated) {
      generated.textContent = data.generatedAt
        ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
        : "";
    }

    renderPirateMetrics(data.pirateMetrics);
    renderOpsMetrics(data.opsMetrics);
    renderSignupDropoff(data.signupDropoff);
    renderActivationFunnel(data.activationFunnel);

    renderStatCards("#cards-growth", [
      ["Total players", totals.totalPlayers],
      ["New (7 days)", totals.newSignups7Days],
      ["New (30 days)", totals.newSignups30Days],
      ["With a team", totals.usersWithTeam],
      ["Total teams", totals.totalTeams],
      ["Roster players", totals.totalRosterPlayers],
    ]);

    renderStatCards("#cards-engagement", [
      ["Active (24h)", totals.activeWithin1Day],
      ["Active (7 days)", totals.activeWithin7Days],
      ["Active (30 days)", totals.activeWithin30Days],
      ["Ever worked out", totals.everCompletedWorkout],
      ["Active programs", totals.activePrograms],
      ["Completed programs", totals.completedPrograms],
      ["Tutorial watchers", totals.tutorialWatchers],
      ["Tutorials watched", totals.totalTutorialsWatched],
    ]);

    renderStatCards("#cards-vertical", [
      ["VJ testers", totals.verticalJumpTesters],
      ["Total VJ tests", totals.totalVerticalJumpTests],
      ["Avg best VJ", metricLabel(metrics.bestVerticalJumpCm, "cm")],
      ["Median best VJ", metrics.bestVerticalJumpCm?.median != null ? `${metrics.bestVerticalJumpCm.median} cm` : null],
      ["Avg current VJ", metricLabel(metrics.currentVerticalJumpCm, "cm")],
    ]);

    renderStatCards("#cards-physical", [
      ["Avg height", metricLabel(metrics.height, "cm") || (data.averageHeightCm ? `${data.averageHeightCm} cm` : null)],
      ["Median height", metrics.height?.median != null ? `${metrics.height.median} cm` : (data.medianHeightCm ? `${data.medianHeightCm} cm` : null)],
      ["Avg weight", metricLabel(metrics.weight, "kg")],
      ["Avg age", metricLabel(metrics.age) || data.averageAge],
      ["Avg points", metricLabel(metrics.points)],
      ["Avg gym days/wk", metricLabel(metrics.gymAvailabilityPerWeek)],
      ["Avg basketball days/wk", metricLabel(metrics.basketballFrequencyPerWeek)],
      ["Avg roster size", metricLabel(metrics.teamRosterSize)],
    ]);

    const chartsGrid = document.querySelector("#charts-grid");
    if (chartsGrid) {
      chartsGrid.replaceChildren(
        buildBarChart("By position", distributions.byPosition),
        buildBarChart("By country (top 12)", distributions.byCountry, { limit: 12 }),
        buildBarChart("By gender", distributions.byGender),
        buildBarChart("By program status", distributions.byProgramStatus),
        buildBarChart("By height band", distributions.byHeightBand, { sortByValue: false }),
        buildBarChart("By age band", distributions.byAgeBand, { sortByValue: false }),
        buildBarChart("By equipment", distributions.byEquipment),
        buildBarChart("By fitness goal", distributions.byFitnessGoal),
        buildBarChart("By plan week", distributions.byPlanWeek, { sortByValue: false }),
        buildBarChart("By plan cycle", distributions.byPlanCycle, { sortByValue: false }),
      );
    }

    renderTimeChart("#chart-signups", trends.signupsByMonth);
  } catch (error) {
    showError(summaryError, error);
  } finally {
    setButtonBusy(button, false, "");
  }
};

const renderPmfDistribution = (byDisappointment) => {
  const container = document.querySelector("#pmf-distribution");
  if (!container) return;

  const distribution = {
    "Very disappointed": byDisappointment?.very ?? 0,
    "Somewhat disappointed": byDisappointment?.somewhat ?? 0,
    "Not disappointed": byDisappointment?.not ?? 0,
  };

  container.replaceChildren(
    buildBarChart("Responses by disappointment level", distribution, { sortByValue: false }),
  );
};

const createPmfRow = (response) => {
  const row = document.createElement("tr");
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  const values = [
    response.username,
    PMF_LABELS[response.disappointment] || response.disappointment,
    truncateText(response.mainBenefit, 72),
    truncateText(response.improvementFeedback, 72),
    response.workoutsCompleted,
    response.submittedAt
      ? new Date(response.submittedAt).toLocaleString()
      : null,
  ];

  values.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = displayValue(value);
    if (index === 2 || index === 3) {
      cell.title = displayValue(index === 2 ? response.mainBenefit : response.improvementFeedback);
      cell.className = "text-cell";
    }
    row.append(cell);
  });

  const open = () => openPlayer(response.userId);
  row.addEventListener("click", open);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open();
  });
  return row;
};

const callPmfResponses = async ({ append = false } = {}) => {
  const loadMore = document.querySelector("#load-more-pmf");
  pmfResponsesError.textContent = "";
  setButtonBusy(loadMore, true, "Loading…");
  try {
    const { data } = await listPmfResponses({
      pageSize: 50,
      cursor: append ? nextPmfCursor : null,
    });
    const rows = document.querySelector("#pmf-rows");
    const rendered = (data.responses || []).map(createPmfRow);
    append ? rows.append(...rendered) : rows.replaceChildren(...rendered);
    nextPmfCursor = data.nextCursor || null;
    loadMore.hidden = !nextPmfCursor;
  } catch (error) {
    showError(pmfResponsesError, error);
  } finally {
    setButtonBusy(loadMore, false, "");
  }
};

const callPmf = async () => {
  const button = document.querySelector("#refresh-pmf");
  pmfError.textContent = "";
  pmfResponsesError.textContent = "";
  setButtonBusy(button, true, "Loading…");
  try {
    const { data } = await getPmfSummary({});
    const totals = data.totals || {};

    const generated = document.querySelector("#pmf-generated");
    if (generated) {
      generated.textContent = data.generatedAt
        ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
        : "";
    }

    const benchmark = document.querySelector("#pmf-benchmark-note");
    if (benchmark) {
      benchmark.textContent = data.benchmarkNote || "";
    }

    const pmfScoreLabel =
      data.pmfScore == null ? "—" : `${data.pmfScore}%`;

    renderStatCards("#cards-pmf", [
      ["PMF score", pmfScoreLabel],
      ["Total responses", totals.totalResponses],
      ["Very disappointed", totals.veryDisappointed],
      ["Somewhat disappointed", totals.somewhatDisappointed],
      ["Not disappointed", totals.notDisappointed],
      ["Last 7 days", totals.responsesLast7Days],
      ["Last 30 days", totals.responsesLast30Days],
    ]);

    renderPmfDistribution(data.byDisappointment);
    nextPmfCursor = null;
    await callPmfResponses();
  } catch (error) {
    showError(pmfError, error);
  } finally {
    setButtonBusy(button, false, "");
  }
};

const createPlayerRow = (player) => {
  const row = document.createElement("tr");
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  const values = [
    player.username,
    player.position,
    player.country,
    player.heightCm ? `${player.heightCm} cm` : null,
    player.age,
    player.points ?? 0,
    player.bestVerticalJumpCm ? `${player.bestVerticalJumpCm} cm` : null,
    player.currentPlanWeek,
    player.programStatus,
    player.workoutsCompleted ?? 0,
    player.recoveriesCompleted ?? 0,
    player.lastCompletedWorkoutAt
      ? new Date(player.lastCompletedWorkoutAt).toLocaleDateString()
      : null,
  ];
  values.forEach((value) => {
    const cell = document.createElement("td");
    cell.textContent = displayValue(value);
    row.append(cell);
  });

  const actionsCell = document.createElement("td");
  actionsCell.className = "actions-cell";
  const deleteButton = document.createElement("button");
  deleteButton.className = "button danger table-action";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeleteDialog(player);
  });
  actionsCell.append(deleteButton);
  row.append(actionsCell);

  const open = () => openPlayer(player.userId);
  row.addEventListener("click", open);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open();
  });
  return row;
};

const callPlayers = async ({ append = false } = {}) => {
  const submit = document.querySelector("#filter-form button[type='submit']");
  const loadMore = document.querySelector("#load-more");
  playersError.textContent = "";
  setButtonBusy(append ? loadMore : submit, true, "Loading…");
  try {
    const { data } = await listPlayers({
      filters: activeFilters,
      pageSize: 50,
      cursor: append ? nextCursor : null,
    });
    const rows = document.querySelector("#player-rows");
    const rendered = (data.players || []).map(createPlayerRow);
    append ? rows.append(...rendered) : rows.replaceChildren(...rendered);
    nextCursor = data.nextCursor || null;
    loadMore.hidden = !nextCursor;
  } catch (error) {
    showError(playersError, error);
  } finally {
    setButtonBusy(append ? loadMore : submit, false, "");
  }
};

const formatPmfFeedback = (pmf) => {
  if (!pmf) return null;
  const parts = [PMF_LABELS[pmf.disappointment] || pmf.disappointment];
  if (pmf.mainBenefit) parts.push(`Benefit: ${pmf.mainBenefit}`);
  if (pmf.improvementFeedback) parts.push(`Improve: ${pmf.improvementFeedback}`);
  if (pmf.submittedAt) {
    parts.push(`Submitted ${new Date(pmf.submittedAt).toLocaleString()}`);
  }
  return parts.join(" · ");
};

const playerDetailFields = (data) => ({
  "Masked email": data.emailMasked,
  Gender: data.gender,
  Position: data.position,
  Country: data.country,
  Height: data.heightCm ? `${data.heightCm} cm` : null,
  Age: data.age,
  Points: data.points,
  Team: data.teamId,
  "Program status": data.programStatus,
  "Current plan week": data.currentPlanWeek,
  "Completed plan weeks": data.completedPlanWeeks,
  "Program completed": data.programCompletedAt
    ? new Date(data.programCompletedAt).toLocaleDateString()
    : null,
  "Best vertical jump": data.bestVerticalJumpCm
    ? `${data.bestVerticalJumpCm} cm`
    : null,
  "Current vertical jump": data.currentVerticalJumpCm
    ? `${data.currentVerticalJumpCm} cm`
    : null,
  "VJ tests taken": data.verticalJumpTestsCount,
  "Workouts completed": data.workoutsCompleted ?? 0,
  "Recovery activities completed": data.recoveriesCompleted ?? 0,
  "Basketball days/wk": data.basketballFrequencyPerWeek,
  "Gym days/wk": data.gymAvailabilityPerWeek,
  "Fitness goals": data.fitnessGoals,
  Equipment: data.equipment,
  Achievements: (data.achievements || []).map((a) => a.name || a.id).join(", ") || null,
  "PMF response": formatPmfFeedback(data.pmfFeedback),
  "Signup date": data.signupAt
    ? new Date(data.signupAt).toLocaleDateString()
    : null,
  "Last workout": data.lastCompletedWorkoutAt
    ? new Date(data.lastCompletedWorkoutAt).toLocaleString()
    : null,
});

const syncDeleteButton = () => {
  const input = document.querySelector("#delete-confirm-username");
  const button = document.querySelector("#confirm-delete");
  const typed = input.value.trim().toLowerCase();
  const username = deletePendingUsername.trim().toLowerCase();
  const userId = (deletePendingUserId || "").trim().toLowerCase();
  const matchesUsername = Boolean(username) && typed === username;
  const matchesUserId = Boolean(userId) && typed === userId;
  button.disabled = !(matchesUsername || matchesUserId);
};

const openDeleteDialog = (player) => {
  deletePendingUserId = player.userId;
  deletePendingUsername = player.username || "";
  deleteError.textContent = "";

  const label = deletePendingUsername
    ? `@${deletePendingUsername}`
    : deletePendingUserId;
  document.querySelector("#delete-target-label").textContent = label;

  const confirmInput = document.querySelector("#delete-confirm-username");
  confirmInput.value = "";
  syncDeleteButton();
  deleteDialog.showModal();
  confirmInput.focus();
};

const loadAchievements = async () => {
  if (cachedAchievements) return cachedAchievements;
  try {
    const { data } = await listAchievements({});
    cachedAchievements = data.achievements || [];
  } catch {
    cachedAchievements = [];
  }
  return cachedAchievements;
};

const populateAchievementDropdown = (achievements, playerAchievementIds = []) => {
  const select = document.querySelector("#edit-achievement");
  const options = [document.createElement("option")];
  options[0].value = "";
  options[0].textContent = "— Select achievement —";
  achievements.forEach((ach) => {
    const opt = document.createElement("option");
    opt.value = ach.id;
    const owned = playerAchievementIds.includes(ach.id) ? " ✓" : "";
    opt.textContent = `${ach.name || ach.id}${owned}`;
    options.push(opt);
  });
  select.replaceChildren(...options);
};

const openPlayer = async (userId) => {
  selectedPlayerId = userId;
  selectedPlayerUsername = "";
  selectedPlayerBirthDate = null;
  playerError.textContent = "";
  document.querySelector("#edit-error").textContent = "";
  document.querySelector("#edit-success").textContent = "";
  document.querySelector("#player-name").textContent = "Loading…";
  document.querySelector("#player-id").textContent = userId;
  document.querySelector("#player-details").replaceChildren();
  document.querySelector("#sensitive-details").hidden = true;
  document.querySelector("#sensitive-details").replaceChildren();
  document.querySelector("#reveal-sensitive").disabled = false;
  document.querySelector("#reveal-sensitive").textContent = "Reveal sensitive fields";
  document.querySelector("#edit-username").value = "";
  document.querySelector("#edit-gender").value = "";
  document.querySelector("#edit-achievement").replaceChildren();
  const birthdateInput = document.querySelector("#edit-birthdate");
  if (birthdateInput) {
    birthdateInput.value = "";
    birthdateInput.disabled = true;
  }
  playerDialog.showModal();
  try {
    const { data } = await getPlayer({ userId, revealSensitive: false });
    selectedPlayerUsername = data.username || "";
    document.querySelector("#player-name").textContent =
      selectedPlayerUsername || "Player";

    document.querySelector("#edit-username").value = data.username || "";
    document.querySelector("#edit-gender").value = data.gender || "";

    renderDetails(document.querySelector("#player-details"), playerDetailFields(data));

    const achievements = await loadAchievements();
    const playerAchIds = (data.achievements || []).map((a) => a.id);
    populateAchievementDropdown(achievements, playerAchIds);

    const ownedSummary = document.querySelector("#owned-achievements");
    if (ownedSummary) {
      const ownedNames = (data.achievements || [])
        .map((a) => a.name || a.id)
        .filter(Boolean);
      ownedSummary.textContent = ownedNames.length
        ? `Unlocked: ${ownedNames.join(", ")}`
        : "Unlocked: —";
    }
  } catch (error) {
    showError(playerError, error);
  }
};

const savePlayer = async () => {
  const button = document.querySelector("#save-player");
  const editError = document.querySelector("#edit-error");
  const editSuccess = document.querySelector("#edit-success");
  editError.textContent = "";
  editSuccess.textContent = "";
  if (!selectedPlayerId) return;

  const updates = {};
  const newUsername = document.querySelector("#edit-username").value.trim();
  const newGender = document.querySelector("#edit-gender").value;
  const achievementId = document.querySelector("#edit-achievement").value;
  const birthdateInput = document.querySelector("#edit-birthdate");
  const newBirthDate = birthdateInput?.value || "";

  if (newUsername && newUsername !== selectedPlayerUsername) {
    updates.username = newUsername;
  }
  if (newGender !== undefined) {
    updates.gender = newGender || null;
  }
  if (achievementId) {
    updates.addAchievementId = achievementId;
  }
  if (birthdateInput && birthdateInput.disabled !== true) {
    if (newBirthDate && newBirthDate !== selectedPlayerBirthDate) {
      updates.birthDate = newBirthDate;
    }
  }

  if (!Object.keys(updates).length) {
    editError.textContent = "No changes to save.";
    return;
  }

  setButtonBusy(button, true, "Saving…");
  try {
    await updatePlayer({ userId: selectedPlayerId, ...updates });
    editSuccess.textContent = "Player updated successfully.";
    selectedPlayerUsername = newUsername || selectedPlayerUsername;
    if (birthdateInput && birthdateInput.disabled !== true && newBirthDate) {
      selectedPlayerBirthDate = newBirthDate;
    }
    document.querySelector("#player-name").textContent = selectedPlayerUsername || "Player";
    // Refresh the detail view
    const { data } = await getPlayer({ userId: selectedPlayerId, revealSensitive: false });
    document.querySelector("#edit-username").value = data.username || "";
    document.querySelector("#edit-gender").value = data.gender || "";
    const achievements = await loadAchievements();
    const playerAchIds = (data.achievements || []).map((a) => a.id);
    populateAchievementDropdown(achievements, playerAchIds);
    document.querySelector("#edit-achievement").value = "";
    const ownedSummary = document.querySelector("#owned-achievements");
    if (ownedSummary) {
      const ownedNames = (data.achievements || [])
        .map((a) => a.name || a.id)
        .filter(Boolean);
      ownedSummary.textContent = ownedNames.length
        ? `Unlocked: ${ownedNames.join(", ")}`
        : "Unlocked: —";
    }

    renderDetails(document.querySelector("#player-details"), playerDetailFields(data));
  } catch (error) {
    showError(editError, error);
  } finally {
    setButtonBusy(button, false, "");
  }
};

const generatePlanForPlayer = async () => {
  const button = document.querySelector("#generate-plan");
  const editError = document.querySelector("#edit-error");
  const editSuccess = document.querySelector("#edit-success");
  editError.textContent = "";
  editSuccess.textContent = "";
  if (!selectedPlayerId) return;

  const label = selectedPlayerUsername ? `@${selectedPlayerUsername}` : selectedPlayerId;
  const confirmed = window.confirm(
    `Generate a new plan for ${label}?\n\nThis will reset plan progress and overwrite the current plan text.`,
  );
  if (!confirmed) return;

  setButtonBusy(button, true, "Generating…");
  try {
    await generateNewPlan({ userId: selectedPlayerId });
    editSuccess.textContent = "Plan generated successfully.";

    const { data } = await getPlayer({ userId: selectedPlayerId, revealSensitive: false });
    selectedPlayerUsername = data.username || "";
    document.querySelector("#player-name").textContent = selectedPlayerUsername || "Player";
    document.querySelector("#edit-username").value = data.username || "";
    document.querySelector("#edit-gender").value = data.gender || "";

    const achievements = await loadAchievements();
    const playerAchIds = (data.achievements || []).map((a) => a.id);
    populateAchievementDropdown(achievements, playerAchIds);
    document.querySelector("#edit-achievement").value = "";

    const ownedSummary = document.querySelector("#owned-achievements");
    if (ownedSummary) {
      const ownedNames = (data.achievements || [])
        .map((a) => a.name || a.id)
        .filter(Boolean);
      ownedSummary.textContent = ownedNames.length
        ? `Unlocked: ${ownedNames.join(", ")}`
        : "Unlocked: —";
    }

    renderDetails(document.querySelector("#player-details"), playerDetailFields(data));
  } catch (error) {
    showError(editError, error);
  } finally {
    setButtonBusy(button, false, "");
  }
};

const revealSensitive = async () => {
  const button = document.querySelector("#reveal-sensitive");
  if (!selectedPlayerId) return;
  playerError.textContent = "";
  setButtonBusy(button, true, "Loading…");
  try {
    const { data } = await getPlayer({
      userId: selectedPlayerId,
      revealSensitive: true,
    });
    const details = document.querySelector("#sensitive-details");
    renderDetails(details, {
      Email: data.email,
      "Birth date": data.birthDate,
      Weight: data.weightKg ? `${data.weightKg} kg` : null,
      Injuries: data.injuries,
      "Recovery goal": data.recoveryGoal,
    });
    details.hidden = false;

    // Enable the DOB editor once sensitive fields have been revealed.
    const birthdateInput = document.querySelector("#edit-birthdate");
    if (birthdateInput) {
      const raw = typeof data.birthDate === "string" ? data.birthDate : "";
      // Firestore generally stores `yyyy-mm-dd`, but normalize defensively.
      const iso = raw ? raw.slice(0, 10) : "";
      birthdateInput.value = iso || "";
      birthdateInput.disabled = false;
      selectedPlayerBirthDate = iso || null;
    }
  } catch (error) {
    showError(playerError, error);
    button.disabled = false;
  } finally {
    if (button.disabled) button.textContent = "Sensitive fields revealed";
    else setButtonBusy(button, false, "");
  }
};

const confirmDeleteUser = async () => {
  const button = document.querySelector("#confirm-delete");
  const confirmInput = document.querySelector("#delete-confirm-username");
  if (!deletePendingUserId) return;

  const typed = confirmInput.value.trim();
  const username = deletePendingUsername.trim();
  const matchesUsername =
    Boolean(username) && typed.toLowerCase() === username.toLowerCase();
  const matchesUserId = typed.toLowerCase() === deletePendingUserId.toLowerCase();
  if (!matchesUsername && !matchesUserId) {
    deleteError.textContent = "Type the exact username or user ID to confirm deletion.";
    return;
  }

  const label = username ? `@${username}` : deletePendingUserId;
  const confirmed = window.confirm(
    `Permanently delete ${label}?\n\nThis removes Auth, profile, username/email reservations, training data, nutrition, vertical-jump history, notifications, profile images, and team roster links.`,
  );
  if (!confirmed) return;

  deleteError.textContent = "";
  setButtonBusy(button, true, "Deleting…");
  confirmInput.disabled = true;
  try {
    await deleteUser({
      userId: deletePendingUserId,
      confirmUsername: typed,
    });
    deleteDialog.close();
    deletePendingUserId = null;
    deletePendingUsername = "";
    confirmInput.value = "";
    if (selectedPlayerId) {
      playerDialog.close();
      selectedPlayerId = null;
      selectedPlayerUsername = "";
    }
    await callPlayers();
  } catch (error) {
    showError(deleteError, error);
  } finally {
    confirmInput.disabled = false;
    setButtonBusy(button, false, "");
    syncDeleteButton();
  }
};

const activateAdmin = async (user) => {
  const emailMatches =
    user.email?.trim().toLowerCase() === allowedAdminEmail.toLowerCase();
  const token = await user.getIdTokenResult(true);
  if (!emailMatches || token.claims.admin !== true) {
    await signOut(auth);
    throw new Error("This account is not authorized for BallBrain Admin.");
  }

  staffEmail.textContent = user.email;
  loginView.hidden = true;
  adminView.hidden = false;
  await Promise.all([callSummary(), callPlayers()]);
};

if (!configured) {
  loginForm.querySelector("button").disabled = true;
  loginError.textContent =
    "Firebase web configuration is incomplete. See admin/README.md.";
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  const functions = getFunctions(app, "us-central1");
  listPlayers = httpsCallable(functions, "adminListPlayers");
  getSummary = httpsCallable(functions, "adminGetSummary");
  getPlayer = httpsCallable(functions, "adminGetPlayer");
  updatePlayer = httpsCallable(functions, "adminUpdatePlayer");
  generateNewPlan = httpsCallable(functions, "adminGenerateNewPlan");
  listAchievements = httpsCallable(functions, "adminListAchievements");
  deleteUser = httpsCallable(functions, "adminDeleteUser");
  getPmfSummary = httpsCallable(functions, "adminGetPmfSummary");
  listPmfResponses = httpsCallable(functions, "adminListPmfResponses");

  onAuthStateChanged(auth, async (user) => {
    loginView.hidden = Boolean(user);
    adminView.hidden = true;
    if (!user) return;
    try {
      await activateAdmin(user);
    } catch (error) {
      loginView.hidden = false;
      showError(loginError, error);
    }
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const button = loginForm.querySelector("button");
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;

  if (email !== allowedAdminEmail.toLowerCase()) {
    loginError.textContent = "This email is not authorized.";
    return;
  }

  setButtonBusy(button, true, "Signing in…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showError(loginError, error);
  } finally {
    setButtonBusy(button, false, "");
  }
});

document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
document.querySelector("#refresh-summary").addEventListener("click", callSummary);
document.querySelector("#refresh-pmf").addEventListener("click", callPmf);
document.querySelector("#load-more").addEventListener("click", () =>
  callPlayers({ append: true }),
);
document.querySelector("#load-more-pmf").addEventListener("click", () =>
  callPmfResponses({ append: true }),
);
document.querySelector("#close-dialog").addEventListener("click", () =>
  playerDialog.close(),
);
document.querySelector("#close-delete-dialog").addEventListener("click", () =>
  deleteDialog.close(),
);
document.querySelector("#cancel-delete").addEventListener("click", () =>
  deleteDialog.close(),
);
document.querySelector("#reveal-sensitive").addEventListener("click", revealSensitive);
document.querySelector("#delete-confirm-username").addEventListener("input", syncDeleteButton);
document.querySelector("#confirm-delete").addEventListener("click", confirmDeleteUser);
document.querySelector("#save-player").addEventListener("click", savePlayer);
document.querySelector("#generate-plan").addEventListener("click", generatePlanForPlayer);

document.querySelector("#filter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const numberOrUndefined = (selector) => {
    const value = document.querySelector(selector).value;
    return value ? Number(value) : undefined;
  };
  activeFilters = {
    search: document.querySelector("#search").value.trim() || undefined,
    position: document.querySelector("#position").value || undefined,
    country: document.querySelector("#country").value.trim() || undefined,
    teamId: document.querySelector("#team-id").value.trim() || undefined,
    minHeightCm: numberOrUndefined("#min-height"),
    maxHeightCm: numberOrUndefined("#max-height"),
    minAge: numberOrUndefined("#min-age"),
    maxAge: numberOrUndefined("#max-age"),
    activeWithinDays: numberOrUndefined("#activity"),
  };
  nextCursor = null;
  callPlayers();
});

let pmfLoaded = false;

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) =>
      item.classList.toggle("active", item === tab),
    );
    const view = tab.dataset.view;
    document.querySelector("#dashboard-section").hidden = view !== "dashboard";
    document.querySelector("#pmf-section").hidden = view !== "pmf";
    document.querySelector("#players-section").hidden = view !== "players";

    if (view === "pmf" && !pmfLoaded) {
      pmfLoaded = true;
      void callPmf();
    }
  });
});
