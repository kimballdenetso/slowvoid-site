<?php
/**
 * ADMIN.PHP
 * Password-gated page for viewing and deleting comments. Not linked
 * from anywhere on the public site — bookmark the URL directly
 * (e.g. http://localhost:8889/your-site/api/admin.php on MAMP).
 *
 * Auth is a single shared password (ADMIN_PASSWORD_HASH in config.php),
 * not a full user system — appropriate here since there's only one
 * admin (the site owner) and no per-user permissions to model.
 */

require __DIR__ . '/db.php';
session_start();

$loginError = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if (password_verify($_POST['password'], ADMIN_PASSWORD_HASH)) {
        session_regenerate_id(true);
        $_SESSION['is_admin'] = true;
    } else {
        $loginError = 'Incorrect password.';
    }
}

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: admin.php');
    exit;
}

$isAdmin = !empty($_SESSION['is_admin']);
$comments = [];

if ($isAdmin) {
    $comments = $pdo
        ->query('SELECT id, track_id, timestamp_seconds, name, comment_text, created_at FROM comments ORDER BY created_at DESC')
        ->fetchAll();
}

/** mm:ss formatting for the timestamp column, matching the player's display */
function format_timestamp(float $seconds): string
{
    $mins = floor($seconds / 60);
    $secs = str_pad((string) floor($seconds % 60), 2, '0', STR_PAD_LEFT);
    return "{$mins}:{$secs}";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Comment Admin</title>
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/comments.css">
</head>
<body>
<main class="container" style="padding-block: var(--space-6);">

  <?php if (!$isAdmin): ?>

    <h1>Admin Login</h1>

    <?php if ($loginError): ?>
      <p style="color: var(--color-accent-strong); margin-block: var(--space-3);">
        <?= htmlspecialchars($loginError) ?>
      </p>
    <?php endif; ?>

    <form method="post" class="comment-form" style="max-width: 320px; margin-top: var(--space-4);">
      <div class="comment-form__row">
        <label class="visually-hidden" for="password">Password</label>
        <input
          class="comment-form__input" type="password"
          id="password" name="password" placeholder="Admin password" required autofocus
        >
      </div>
      <button class="btn btn--accent" type="submit">Log in</button>
    </form>

  <?php else: ?>

    <div style="display:flex; justify-content:space-between; align-items:center; gap: var(--space-4); margin-bottom: var(--space-5); flex-wrap: wrap;">
      <h1>Comments (<?= count($comments) ?>)</h1>
      <a class="btn btn--quiet" href="?logout=1">Log out</a>
    </div>

    <?php if (empty($comments)): ?>
      <p style="color: var(--color-text-muted);">No comments yet.</p>
    <?php else: ?>
      <table class="admin-comments">
        <?php foreach ($comments as $comment): ?>
          <tr class="admin-comments__row" data-row-id="<?= (int) $comment['id'] ?>">
            <td><?= htmlspecialchars($comment['track_id']) ?></td>
            <td><?= format_timestamp((float) $comment['timestamp_seconds']) ?></td>
            <td><?= htmlspecialchars($comment['name']) ?></td>
            <td><?= htmlspecialchars($comment['comment_text']) ?></td>
            <td><?= htmlspecialchars($comment['created_at']) ?></td>
            <td>
              <button
                class="btn btn--accent btn--icon" data-action="delete-comment"
                data-id="<?= (int) $comment['id'] ?>" aria-label="Delete comment"
              >×</button>
            </td>
          </tr>
        <?php endforeach; ?>
      </table>
    <?php endif; ?>

    <script>
      document.querySelectorAll('[data-action="delete-comment"]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!window.confirm('Delete this comment? This cannot be undone.')) return;

          const id = button.dataset.id;
          try {
            const response = await fetch('comments_delete.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            });
            const result = await response.json();

            if (result.success) {
              document.querySelector(`[data-row-id="${id}"]`)?.remove();
            } else {
              window.alert(result.error || 'Could not delete comment.');
            }
          } catch (err) {
            window.alert('Network error — could not delete comment.');
          }
        });
      });
    </script>

  <?php endif; ?>

</main>
</body>
</html>
