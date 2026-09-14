/* ==========================================================================
   ADMIN.JS
   Password-gated comment editor for the site owner — lists every
   comment across every track, with inline edit + delete. Lives in the
   right .side-panel (see index.html / css/admin.css) and is
   desktop-only: that panel is already display:none below the 900px
   breakpoint (responsive.css), and the DESKTOP_MIN_WIDTH check below
   is a second guard so the toggle button does nothing on narrow
   viewports even if something else overrides that CSS.

   Independent module, same pattern as social.js/parallax.js/panels.js.

   Auth is a plain PHP session (api/db.php + $_SESSION['is_admin']) —
   the same one api/admin.php's own login form sets, via
   api/admin_login.php / api/admin_logout.php / api/admin_session.php.
   No token is stored client-side; the browser's session cookie is
   what keeps you logged in, exactly as it does on admin.php.

   Talks to:
     api/admin_session.php   GET  -> { is_admin }
     api/admin_login.php     POST { password } -> { success } | 401
     api/admin_logout.php    POST -> { success }
     api/comments_all.php    GET  -> { comments: [...] }
     api/comments_edit.php   POST { id, name, comment } -> { success, comment }
     api/comments_delete.php POST { id } -> { success }
                              (existing endpoint, unchanged — already
                              session-gated exactly like the above)
   ========================================================================== */

const API_BASE = 'api/';
const DESKTOP_MIN_WIDTH = 900; // matches the .side-panel breakpoint in responsive.css

const adminToggle = document.getElementById('admin-toggle');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('admin-login-form');
const passwordInput = document.getElementById('admin-password');
const loginError = document.getElementById('admin-login-error');
const editor = document.getElementById('admin-editor');
const logoutBtn = document.getElementById('admin-logout');
const commentList = document.getElementById('admin-comment-list');

function isDesktop() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/* --------------------------------------------------------------------------
   Panel open/close
   -------------------------------------------------------------------------- */

async function openPanel() {
  adminPanel.hidden = false;
  adminToggle.setAttribute('aria-expanded', 'true');

  const loggedIn = await checkSession();
  if (loggedIn) {
    showEditor();
    loadAllComments();
  } else {
    showLogin();
  }
}

function closePanel() {
  adminPanel.hidden = true;
  adminToggle.setAttribute('aria-expanded', 'false');
}

function togglePanel() {
  if (!isDesktop()) return; // editor is desktop-only, see file header
  if (adminPanel.hidden) {
    openPanel();
  } else {
    closePanel();
  }
}

function showLogin() {
  loginForm.hidden = false;
  editor.hidden = true;
  loginError.hidden = true;
  passwordInput.value = '';
  passwordInput.focus();
}

function showEditor() {
  loginForm.hidden = true;
  editor.hidden = false;
}

/* --------------------------------------------------------------------------
   Auth
   -------------------------------------------------------------------------- */

async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}admin_session.php`, { credentials: 'same-origin' });
    const data = await response.json();
    return Boolean(data.is_admin);
  } catch {
    return false;
  }
}

async function login(password) {
  const response = await fetch(`${API_BASE}admin_login.php`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Incorrect password');
  return data; // { success }
}

async function logout() {
  try {
    await fetch(`${API_BASE}admin_logout.php`, { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Even if the request fails, still reset the panel to a logged-out
    // state locally — worst case the server session lingers until it
    // naturally expires.
  }
  commentList.innerHTML = '';
  showLogin();
}

/* --------------------------------------------------------------------------
   Loading + rendering comments
   -------------------------------------------------------------------------- */

async function loadAllComments() {
  commentList.innerHTML = '';
  const loadingLi = document.createElement('li');
  loadingLi.className = 'admin-panel__empty';
  loadingLi.textContent = 'Loading comments…';
  commentList.appendChild(loadingLi);

  try {
    const response = await fetch(`${API_BASE}comments_all.php`, { credentials: 'same-origin' });
    if (response.status === 401) {
      logout();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load comments');

    const comments = (data.comments || []).slice().sort((a, b) => {
      if (a.track_id !== b.track_id) return a.track_id < b.track_id ? -1 : 1;
      return a.timestamp_seconds - b.timestamp_seconds;
    });

    commentList.innerHTML = '';
    if (comments.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'admin-panel__empty';
      emptyLi.textContent = 'No comments yet.';
      commentList.appendChild(emptyLi);
      return;
    }
    comments.forEach((comment) => commentList.appendChild(renderAdminComment(comment)));
  } catch (err) {
    commentList.innerHTML = '';
    const errorLi = document.createElement('li');
    errorLi.className = 'admin-panel__empty';
    errorLi.textContent = err.message || 'Could not load comments.';
    commentList.appendChild(errorLi);
  }
}

function renderAdminComment(comment) {
  const li = document.createElement('li');
  li.className = 'admin-comment';
  li.dataset.commentId = String(comment.id);
  li.dataset.trackId = comment.track_id;

  const meta = document.createElement('div');
  meta.className = 'admin-comment__meta';

  const timestampEl = document.createElement('span');
  timestampEl.className = 'admin-comment__timestamp';
  timestampEl.textContent = formatTime(comment.timestamp_seconds);

  const trackEl = document.createElement('span');
  trackEl.className = 'admin-comment__track';
  trackEl.textContent = comment.track_id;

  meta.append(timestampEl, trackEl);

  const nameInput = document.createElement('input');
  nameInput.className = 'admin-comment__input admin-comment__input--name';
  nameInput.maxLength = 80;
  nameInput.value = comment.name;

  const textInput = document.createElement('textarea');
  textInput.className = 'admin-comment__input admin-comment__input--text';
  textInput.maxLength = 500;
  textInput.value = comment.comment_text;

  [nameInput, textInput].forEach((field) => {
    field.addEventListener('input', () => field.classList.add('is-dirty'));
  });

  const actions = document.createElement('div');
  actions.className = 'admin-comment__actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn admin-comment__save';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () =>
    saveComment(comment.id, nameInput, textInput, saveBtn)
  );

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--accent admin-comment__delete';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteComment(comment.id, li));

  actions.append(saveBtn, deleteBtn);
  li.append(meta, nameInput, textInput, actions);
  return li;
}

/* --------------------------------------------------------------------------
   Save / delete
   -------------------------------------------------------------------------- */

async function saveComment(commentId, nameInput, textInput, saveBtn) {
  const name = nameInput.value.trim();
  const comment = textInput.value.trim();
  if (!name || !comment) return;

  saveBtn.disabled = true;
  try {
    const response = await fetch(`${API_BASE}comments_edit.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: commentId, name, comment }),
    });
    if (response.status === 401) {
      logout();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save comment');

    nameInput.classList.remove('is-dirty');
    textInput.classList.remove('is-dirty');
  } catch (err) {
    window.alert(err.message || 'Could not save comment.');
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteComment(commentId, listItemEl) {
  if (!window.confirm('Delete this comment?')) return;
  try {
    const response = await fetch(`${API_BASE}comments_delete.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: commentId }),
    });
    if (response.status === 401) {
      logout();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete comment');

    listItemEl.remove();
    if (!commentList.querySelector('.admin-comment')) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'admin-panel__empty';
      emptyLi.textContent = 'No comments yet.';
      commentList.appendChild(emptyLi);
    }
  } catch (err) {
    window.alert(err.message || 'Could not delete comment.');
  }
}

/* --------------------------------------------------------------------------
   Wiring
   -------------------------------------------------------------------------- */

adminToggle.addEventListener('click', togglePanel);

logoutBtn.addEventListener('click', logout);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) return;

  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  loginError.hidden = true;
  try {
    await login(password);
    showEditor();
    loadAllComments();
  } catch (err) {
    loginError.textContent = err.message || 'Incorrect password';
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

// If the viewport is resized down below desktop while the panel is
// open, close it — the panel itself would already be visually hidden
// by responsive.css, but this keeps aria-expanded / focus state honest.
window.addEventListener('resize', () => {
  if (!isDesktop() && !adminPanel.hidden) {
    closePanel();
  }
});
