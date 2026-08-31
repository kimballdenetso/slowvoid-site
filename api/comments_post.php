<?php
/**
 * COMMENTS_POST.PHP
 * POST /api/comments_post.php
 * Body (JSON or form-encoded): track_id, timestamp_seconds, name, comment,
 * website (honeypot — must stay empty).
 *
 * No login: identity is just whatever the visitor typed as `name`. Spam
 * mitigation is limited to what doesn't require an account — a honeypot
 * field and a per-IP rate limit (see config.php for the interval).
 */

require __DIR__ . '/db.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Accept either JSON body (fetch with Content-Type: application/json)
// or a regular form POST, so comments.js has flexibility in how it sends this.
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

// Honeypot: a real visitor never sees or fills this field (it's visually
// hidden in comments.css). If it's filled in, silently report success so
// the bot doesn't learn to try again differently.
if (!empty($input['website'])) {
    echo json_encode(['success' => true]);
    exit;
}

$trackId          = isset($input['track_id']) ? trim((string) $input['track_id']) : '';
$timestampSeconds = isset($input['timestamp_seconds']) ? filter_var($input['timestamp_seconds'], FILTER_VALIDATE_FLOAT) : false;
$name             = isset($input['name']) ? trim((string) $input['name']) : '';
$commentText      = isset($input['comment']) ? trim((string) $input['comment']) : '';

if ($trackId === '' || $timestampSeconds === false || $timestampSeconds < 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid track_id / timestamp_seconds']);
    exit;
}

if ($name === '' || $commentText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Name and comment are both required']);
    exit;
}

if (mb_strlen($name) > COMMENT_NAME_MAX_LENGTH || mb_strlen($commentText) > COMMENT_TEXT_MAX_LENGTH) {
    http_response_code(400);
    echo json_encode(['error' => 'Name or comment is too long']);
    exit;
}

// Comments render as plain text on the front end, never as HTML — strip
// any tags a visitor tries to sneak in rather than trusting the client.
$name        = strip_tags($name);
$commentText = strip_tags($commentText);

$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . IP_HASH_SALT);

try {
    $rateStmt = $pdo->prepare(
        'SELECT created_at FROM comments WHERE ip_hash = :ip_hash ORDER BY created_at DESC LIMIT 1'
    );
    $rateStmt->execute(['ip_hash' => $ipHash]);
    $lastComment = $rateStmt->fetch();

    if ($lastComment) {
        $secondsSinceLast = time() - strtotime($lastComment['created_at']);
        if ($secondsSinceLast < COMMENT_RATE_LIMIT_SECONDS) {
            http_response_code(429);
            echo json_encode(['error' => 'Please wait a moment before posting again']);
            exit;
        }
    }

    $insertStmt = $pdo->prepare(
        'INSERT INTO comments (track_id, timestamp_seconds, name, comment_text, ip_hash)
         VALUES (:track_id, :timestamp_seconds, :name, :comment_text, :ip_hash)'
    );
    $insertStmt->execute([
        'track_id'          => $trackId,
        'timestamp_seconds' => $timestampSeconds,
        'name'              => $name,
        'comment_text'      => $commentText,
        'ip_hash'           => $ipHash,
    ]);

    echo json_encode([
        'success' => true,
        'comment' => [
            'id'                => (int) $pdo->lastInsertId(),
            'timestamp_seconds' => $timestampSeconds,
            'name'              => $name,
            'comment_text'      => $commentText,
        ],
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save comment']);
}
