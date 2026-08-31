<?php
/**
 * CONFIG.PHP
 * Single place for DB credentials and comment-moderation settings.
 * Every other PHP file requires this indirectly via db.php.
 *
 * -----------------------------------------------------------------------
 * LOCAL (MAMP) — the values below match MAMP's defaults on a Mac with
 * the MySQL port set to 8889. If your MAMP is configured differently,
 * update DB_PORT/DB_USER/DB_PASS to match (MAMP's start page shows the
 * exact values under "MySQL" in the top bar).
 * -----------------------------------------------------------------------
 * DEPLOYING TO BLUEHOST — change these four lines using the credentials
 * shown in cPanel -> MySQL Databases:
 *   DB_HOST -> usually stays 'localhost'
 *   DB_PORT -> 3306 (Bluehost's standard MySQL port, not MAMP's 8889)
 *   DB_NAME -> Bluehost prefixes database names, e.g. 'yourcpaneluser_artist_site'
 *   DB_USER / DB_PASS -> the database user you create in cPanel, NOT your cPanel login
 * -----------------------------------------------------------------------
 */

// --- Database ---
define('DB_HOST', '127.0.0.1');
define('DB_PORT', '8889');        // MAMP default. Use 3306 on Bluehost.
define('DB_NAME', 'YOUR_DB_NAME_HERE');
define('DB_USER', 'root');        // MAMP default.
define('DB_PASS', 'root');        // MAMP default.

// --- Admin authentication (used by admin.php / comments_delete.php) ---
// Generate your own hash before deploying anywhere public:
//   php -r "echo password_hash('your-new-password', PASSWORD_DEFAULT), PHP_EOL;"
// Run that in Terminal, then paste the output below. The placeholder
// hash here corresponds to the password "changeme" — replace it.
define('ADMIN_PASSWORD_HASH', 'yourpassword');

// --- Comment rules ---
define('COMMENT_NAME_MAX_LENGTH', 80);
define('COMMENT_TEXT_MAX_LENGTH', 500);
define('COMMENT_RATE_LIMIT_SECONDS', 30); // minimum gap between posts from the same visitor

// --- Misc ---
// Mixed into the IP hash so the stored hash isn't reversible/guessable
// even by someone who can read the database. Change this to any random
// string — it does not need to be memorable, just consistent.
define('IP_HASH_SALT', 'change-this-to-any-random-string');
