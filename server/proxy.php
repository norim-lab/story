<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (!isset($_GET['url'])) {
    http_response_code(400);
    echo "Missing url parameter";
    exit;
}

$url = $_GET['url'];
// Basic validation to ensure we only proxy auphonic domains or cloudflare storage
if (strpos($url, 'auphonic.com') === false && strpos($url, 'cloudflarestorage.com') === false) {
    http_response_code(403);
    echo "Forbidden URL";
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);

// Pass through Authorization header if present
$headers = [];
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($authHeader) {
    $headers[] = 'Authorization: ' . $authHeader;
}
if (!empty($headers)) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
}

$response = curl_exec($ch);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($response === false) {
    http_response_code(502);
    echo "Proxy Error: " . curl_error($ch);
    curl_close($ch);
    exit;
}

curl_close($ch);

http_response_code($httpCode);
if ($contentType) {
    header('Content-Type: ' . $contentType);
}
echo $response;
