/* ==========================================================================
   COMMENTS.JS
   Loads/renders timestamp comments for the current track, posts new ones
   (no login — name + text only), places markers on the scrub bar, and
   lets a visitor delete a comment THEY posted this session (no login
   required for that either — see api/comments_post.php /
   comments_delete.php for the owner-token mechanism this relies on).

   Talks to: api/comments_get.php, api/comments_post.php, api/comments_delete.php
   Matches the markup contract at the top of css/comments.css.

   Depends on: the shared #track-audio element (for duration, to place
   markers) and listens for 'trackchange' from main.js. Seeking is done
   by dispatching 'seektotimestamp', which player.js listens for — this
   module never touches audioEl.currentTime directly, keeping seek logic
   in one place.
   ========================================================================== */

const API_BASE = 'api/';
const OWNER_TOKENS_KEY = 'commentOwnerTokens'; // sessionStorage key: { [commentId]: token }

const audioEl = document.getElementById('track-audio');
const commentsSection = document.querySelector('.comments');
const commentsList = commentsSection.querySelector('.comments__list');
const commentForm = commentsSection.querySelector('.comment-form');
const nameInput = commentForm.querySelector('#comment-name');
const textInput = commentForm.querySelector('#comment-text');
const timestampInput = commentForm.querySelector('input[name="timestamp"]');
const honeypotInput = commentForm.querySelector('.comment-form__honeypot');
const submitBtn = commentForm.querySelector('button[type="submit"]');
const timelineEl = document.querySelector('.player__timeline');

let currentTrackId = null;
let markerElements = []; // kept in sync with rendered comments, for repositioning on resize/metadata

/* --------------------------------------------------------------------------
   Owner tokens — sessionStorage only. Cleared automatically when the tab
   closes, which is the intended scope ("delete their own post, even if
   limited to their active session" per the project brief).
   -------------------------------------------------------------------------- */

function getOwnerTokens() {
  try {
    return JSON.parse(sessionStorage.getItem(OWNER_TOKENS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveOwnerToken(commentId, token) {
  const tokens = getOwnerTokens();
  tokens[commentId] = token;
  sessionStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

function removeOwnerToken(commentId) {
  const tokens = getOwnerTokens();
  delete tokens[commentId];
  sessionStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function renderComment(comment) {
  const li = document.createElement('li');
  li.className = 'comment';
  li.dataset.commentId = String(comment.id);

  const timestampEl = document.createElement('span');
  timestampEl.className = 'comment__timestamp';
  timestampEl.textContent = formatTime(comment.timestamp_seconds);
  timestampEl.tabIndex = 0;
  timestampEl.setAttribute('role', 'button');
  timestampEl.setAttribute('aria-label', `Seek to ${formatTime(comment.timestamp_seconds)}`);
  timestampEl.addEventListener('click', () => seekTo(comment.timestamp_seconds));
  timestampEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      seekTo(comment.timestamp_seconds);
    }
  });

  const nameEl = document.createElement('span');
  nameEl.className = 'comment__name';
  nameEl.textContent = comment.name;

  const textEl = document.createElement('p');
  textEl.className = 'comment__text';
  textEl.textContent = comment.comment_text;

  li.append(timestampEl, nameEl, textEl);

  // Only this browser session's own comments get a delete button — no
  // login, so "ownership" is just "do we hold a matching token".
  const ownerTokens = getOwnerTokens();
  const ownerToken = ownerTokens[comment.id];
  if (ownerToken) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--icon btn--quiet comment__delete';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', 'Delete your comment');
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => deleteOwnComment(comment.id, ownerToken, li));
    li.append(deleteBtn);
  }

  return li;
}

function renderMarker(comment) {
  const marker = document.createElement('div');
  marker.className = 'comment-marker';
  marker.dataset.commentId = String(comment.id);
  marker.dataset.seconds = String(comment.timestamp_seconds);
  marker.tabIndex = 0;
  marker.setAttribute('role', 'button');
  marker.setAttribute('aria-label', `Comment from ${comment.name} at ${formatTime(comment.timestamp_seconds)}`);

  marker.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the "new comment here" timeline click handler
    seekTo(comment.timestamp_seconds);
    highlightComment(comment.id);
  });
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      seekTo(comment.timestamp_seconds);
      highlightComment(comment.id);
    }
  });

  timelineEl.appendChild(marker);
  return marker;
}

function positionMarkers() {
  const duration = audioEl.duration;
  if (!duration) return;
  markerElements.forEach((marker) => {
    const seconds = parseFloat(marker.dataset.seconds);
    const percent = Math.max(0, Math.min(100, (seconds / duration) * 100));
    marker.style.left = `${percent}%`;
  });
}

function highlightComment(commentId) {
  const row = commentsList.querySelector(`[data-comment-id="${commentId}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  row.style.outline = '2px solid var(--color-accent)';
  window.setTimeout(() => {
    row.style.outline = '';
  }, 1200);
}

function clearComments() {
  commentsList.innerHTML = '';
  markerElements.forEach((marker) => marker.remove());
  markerElements = [];
}

function renderCommentList(comments) {
  clearComments();
  comments.forEach((comment) => {
    commentsList.appendChild(renderComment(comment));
    markerElements.push(renderMarker(comment));
  });
  positionMarkers();
}

/* --------------------------------------------------------------------------
   Networking
   -------------------------------------------------------------------------- */

async function loadComments(trackId) {
  try {
    const response = await fetch(`${API_BASE}comments_get.php?track_id=${encodeURIComponent(trackId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load comments');
    renderCommentList(data.comments || []);
  } catch (err) {
    clearComments();
    const li = document.createElement('li');
    li.className = 'comment';
    li.textContent = 'Comments could not be loaded right now.';
    commentsList.appendChild(li);
  }
}

async function postComment({ trackId, timestampSeconds, name, comment, website }) {
  const response = await fetch(`${API_BASE}comments_post.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      track_id: trackId,
      timestamp_seconds: timestampSeconds,
      name,
      comment,
      website, // honeypot — always empty for real visitors
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not post comment');
  return data; // { success, comment, owner_token }
}

async function deleteOwnComment(commentId, ownerToken, listItemEl) {
  if (!window.confirm('Delete your comment?')) return;
  try {
    const response = await fetch(`${API_BASE}comments_delete.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: commentId, owner_token: ownerToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete comment');

    listItemEl.remove();
    const marker = timelineEl.querySelector(`.comment-marker[data-comment-id="${commentId}"]`);
    if (marker) marker.remove();
    markerElements = markerElements.filter((m) => m.dataset.commentId !== String(commentId));
    removeOwnerToken(commentId);
  } catch (err) {
    window.alert(err.message || 'Could not delete comment.');
  }
}

/* --------------------------------------------------------------------------
   Seeking (delegates the actual seek to player.js)
   -------------------------------------------------------------------------- */

function seekTo(seconds) {
  document.dispatchEvent(new CustomEvent('seektotimestamp', { detail: { seconds } }));
}

/* --------------------------------------------------------------------------
   "Leave a comment here" — clicking the timeline (not a marker) sets the
   pending timestamp for the form below. This click also naturally seeks
   playback via player.js's own listener on the same element, since both
   listeners fire independently off the same click.
   -------------------------------------------------------------------------- */

let pendingTimestamp = 0;

function updatePendingTimestamp(seconds) {
  pendingTimestamp = seconds;
  timestampInput.value = String(seconds);
  textInput.placeholder = `Leave a comment at ${formatTime(seconds)}`;
}

timelineEl.addEventListener('click', (event) => {
  const duration = audioEl.duration;
  if (!duration) return;
  const rect = timelineEl.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  updatePendingTimestamp(ratio * duration);
});

/* --------------------------------------------------------------------------
   Form submission
   -------------------------------------------------------------------------- */

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentTrackId) return;

  const name = nameInput.value.trim();
  const comment = textInput.value.trim();
  if (!name || !comment) return;

  submitBtn.disabled = true;
  try {
    const result = await postComment({
      trackId: currentTrackId,
      timestampSeconds: pendingTimestamp,
      name,
      comment,
      website: honeypotInput ? honeypotInput.value : '',
    });

    saveOwnerToken(result.comment.id, result.owner_token);

    commentsList.appendChild(renderComment(result.comment));
    markerElements.push(renderMarker(result.comment));
    positionMarkers();

    textInput.value = '';
    // Deliberately leave `name` filled in — likely the same visitor
    // will want to comment again on this track without retyping it.
  } catch (err) {
    window.alert(err.message || 'Could not post comment.');
  } finally {
    submitBtn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Track changes
   -------------------------------------------------------------------------- */

document.addEventListener('trackchange', (event) => {
  currentTrackId = event.detail.trackId;
  updatePendingTimestamp(0);
  loadComments(currentTrackId);
});

audioEl.addEventListener('loadedmetadata', positionMarkers);
window.addEventListener('resize', positionMarkers);
