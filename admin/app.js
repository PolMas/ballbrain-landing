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
const playerDialog = document.querySelector("#player-dialog");

let auth;
let listPlayers;
let getSummary;
let getPlayer;
let nextCursor = null;
let activeFilters = {};
let selectedPlayerId = null;

const showError = (element, error) => {
  const message =
    error?.code === "functions/permission-denied"
      ? "This account does not have the required admin permission."
      : error?.message || "Something went wrong.";
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

const callSummary = async () => {
  const button = document.querySelector("#refresh-summary");
  summaryError.textContent = "";
  setButtonBusy(button, true, "Loading…");
  try {
    const { data } = await getSummary({});
    const cards = [
      ["Total players", data.totalPlayers],
      ["Active in 7 days", data.activeWithin7Days],
      ["Average height", data.averageHeightCm ? `${data.averageHeightCm} cm` : null],
      ["Median height", data.medianHeightCm ? `${data.medianHeightCm} cm` : null],
      ["Average age", data.averageAge],
      ["Completed programs", data.completedPrograms],
    ];
    const cardContainer = document.querySelector("#summary-cards");
    cardContainer.replaceChildren(
      ...cards.map(([label, value]) => {
        const card = document.createElement("div");
        card.className = "stat";
        const strong = document.createElement("strong");
        const span = document.createElement("span");
        strong.textContent = displayValue(value);
        span.textContent = label;
        card.append(strong, span);
        return card;
      }),
    );

    const rows = document.querySelector("#position-rows");
    rows.replaceChildren(
      ...Object.entries(data.byPosition || {})
        .sort((a, b) => b[1] - a[1])
        .map(([position, count]) => {
          const row = document.createElement("tr");
          const positionCell = document.createElement("td");
          const countCell = document.createElement("td");
          positionCell.textContent = position;
          countCell.textContent = String(count);
          row.append(positionCell, countCell);
          return row;
        }),
    );
  } catch (error) {
    showError(summaryError, error);
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
    player.lastCompletedWorkoutAt
      ? new Date(player.lastCompletedWorkoutAt).toLocaleDateString()
      : null,
  ];
  values.forEach((value) => {
    const cell = document.createElement("td");
    cell.textContent = displayValue(value);
    row.append(cell);
  });
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

const openPlayer = async (userId) => {
  selectedPlayerId = userId;
  playerError.textContent = "";
  document.querySelector("#player-name").textContent = "Loading…";
  document.querySelector("#player-id").textContent = userId;
  document.querySelector("#player-details").replaceChildren();
  document.querySelector("#sensitive-details").hidden = true;
  document.querySelector("#sensitive-details").replaceChildren();
  document.querySelector("#reveal-sensitive").disabled = false;
  playerDialog.showModal();
  try {
    const { data } = await getPlayer({ userId, revealSensitive: false });
    document.querySelector("#player-name").textContent = data.username || "Player";
    renderDetails(document.querySelector("#player-details"), {
      "Masked email": data.emailMasked,
      Position: data.position,
      Country: data.country,
      Height: data.heightCm ? `${data.heightCm} cm` : null,
      Age: data.age,
      Points: data.points,
      Team: data.teamId,
      "Program status": data.programStatus,
      "Current plan week": data.currentPlanWeek,
      "Completed plan weeks": data.completedPlanWeeks,
      "Best vertical jump": data.bestVerticalJumpCm
        ? `${data.bestVerticalJumpCm} cm`
        : null,
      "Last workout": data.lastCompletedWorkoutAt
        ? new Date(data.lastCompletedWorkoutAt).toLocaleString()
        : null,
    });
  } catch (error) {
    showError(playerError, error);
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
  } catch (error) {
    showError(playerError, error);
    button.disabled = false;
  } finally {
    if (button.disabled) button.textContent = "Sensitive fields revealed";
    else setButtonBusy(button, false, "");
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
document.querySelector("#load-more").addEventListener("click", () =>
  callPlayers({ append: true }),
);
document.querySelector("#close-dialog").addEventListener("click", () =>
  playerDialog.close(),
);
document.querySelector("#reveal-sensitive").addEventListener("click", revealSensitive);

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
    minHeightCm: numberOrUndefined("#min-height"),
    maxHeightCm: numberOrUndefined("#max-height"),
    minAge: numberOrUndefined("#min-age"),
    maxAge: numberOrUndefined("#max-age"),
    activeWithinDays: numberOrUndefined("#activity"),
  };
  nextCursor = null;
  callPlayers();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) =>
      item.classList.toggle("active", item === tab),
    );
    document.querySelector("#dashboard-section").hidden =
      tab.dataset.view !== "dashboard";
    document.querySelector("#players-section").hidden =
      tab.dataset.view !== "players";
  });
});
