<?php
/*
 * Admin dashboard entry point.
 * The server decides what to render: the login screen for anyone without a
 * valid session, the dashboard only for a logged-in admin. All data still
 * comes from the API, which checks the session again on every request.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/server/bootstrap.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
header('X-Robots-Tag: noindex, nofollow');

try {
    $admin = Auth::current();
    $setupError = null;
} catch (Throwable $e) {
    error_log('[mjt admin] ' . $e->getMessage());
    $admin = null;
    $setupError = 'The dashboard cannot reach the database. Check server/config.php, or run install.php if this is a new installation.';
}
$view = $admin ? 'app' : 'login';
$v = '20261111';
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title><?= $admin ? 'Dashboard' : 'Admin login' ?> | Musa Joshua Timbershade</title>
  <link rel="icon" href="../assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&amp;family=Zilla+Slab:wght@600;700&amp;display=swap">
  <link rel="stylesheet" href="assets/admin.css?v=<?= $v ?>">
</head>
<body class="view-<?= $view ?>" data-view="<?= $view ?>">
<?php if ($view === 'login'): ?>
  <main class="login">
    <div class="login__card">
      <div class="login__brand">
        <svg class="login__mark" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#8B5E3C"/><path d="M8 24 24 11l16 13" fill="none" stroke="#F5F0E6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="27" width="24" height="4" rx="1" fill="#F5F0E6"/><rect x="12" y="33" width="24" height="4" rx="1" fill="#F5F0E6" opacity=".75"/></svg>
        <div>
          <p class="login__name">Musa Joshua Timbershade</p>
          <p class="login__sub">Website dashboard</p>
        </div>
      </div>
      <h1>Log in</h1>
      <?php if ($setupError): ?><p class="alert alert--error" role="alert"><?= htmlspecialchars($setupError) ?></p><?php endif; ?>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="login-username">Username</label>
          <input id="login-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="60">
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <div class="password-wrap">
            <input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="200">
            <button type="button" class="btn btn--ghost btn--sm" data-toggle-password="login-password" aria-pressed="false">Show</button>
          </div>
        </div>
        <p class="alert alert--error" id="login-error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block" type="submit">Log in</button>
      </form>
      <p class="login__foot"><a href="../index.html">&larr; Back to the website</a></p>
    </div>
  </main>
<?php else: ?>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="app">
    <header class="topbar">
      <button class="topbar__menu" type="button" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true">&#9776;</span><span class="visually-hidden">Menu</span></button>
      <span class="topbar__title">Dashboard</span>
      <a class="btn btn--ghost btn--sm" href="../index.html" target="_blank" rel="noopener">View site</a>
    </header>
    <nav class="sidebar" id="sidebar" aria-label="Dashboard">
      <div class="sidebar__brand">
        <svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#8B5E3C"/><path d="M8 24 24 11l16 13" fill="none" stroke="#F5F0E6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="27" width="24" height="4" rx="1" fill="#F5F0E6"/><rect x="12" y="33" width="24" height="4" rx="1" fill="#F5F0E6" opacity=".75"/></svg>
        <span><strong>Timbershade</strong><small>Website dashboard</small></span>
      </div>
      <ul class="sidebar__nav">
        <li><a href="#/overview" data-route="overview">Overview</a></li>
        <li><a href="#/products" data-route="products">Products</a></li>
        <li><a href="#/categories" data-route="categories">Categories</a></li>
        <li><a href="#/homepage" data-route="homepage">Homepage</a></li>
        <li><a href="#/about" data-route="about">About Us</a></li>
        <li><a href="#/testimonials" data-route="testimonials">Testimonials</a></li>
        <li><a href="#/media" data-route="media">Media Library</a></li>
        <li><a href="#/contact" data-route="contact">Contact Details</a></li>
        <li><a href="#/branding" data-route="branding">Branding</a></li>
        <li><a href="#/settings" data-route="settings">Website Settings</a></li>
        <li><a href="#/password" data-route="password">Change Password</a></li>
        <li><button type="button" class="sidebar__logout" data-action="logout">Logout</button></li>
      </ul>
      <p class="sidebar__user">Signed in as <strong><?= htmlspecialchars($admin['username']) ?></strong></p>
    </nav>
    <div class="sidebar-backdrop" hidden></div>
    <main class="main" id="main" tabindex="-1">
      <p class="loading">Loading&hellip;</p>
    </main>
  </div>
  <div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<?php endif; ?>
  <script src="assets/admin.js?v=<?= $v ?>" defer></script>
</body>
</html>
