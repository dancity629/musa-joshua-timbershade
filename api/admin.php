<?php
// Vercel entry point for /admin/ (vercel.json rewrites it here; on PHP hosting admin/index.php is used directly).
declare(strict_types=1);
require dirname(__DIR__) . '/admin/index.php';
