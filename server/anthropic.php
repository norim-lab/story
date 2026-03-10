<?php
header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
$allowedOrigins = [
    'http://localhost',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:5173',
    'https://story.zeitblytz.media'
];

if (in_array($origin, $allowedOrigins) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, x-api-key, anthropic-version');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || trim($rawBody) === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Empty request body'], JSON_UNESCAPED_UNICODE);
    exit;
}

$decoded = json_decode($rawBody, true);
$wrapped = is_array($decoded) && isset($decoded['payload']) && is_array($decoded['payload']);
$payloadBody = $wrapped ? json_encode($decoded['payload']) : $rawBody;
if ($payloadBody === false || trim($payloadBody) === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload'], JSON_UNESCAPED_UNICODE);
    exit;
}

$clientKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
$bodyKey = $wrapped && isset($decoded['apiKey']) && is_string($decoded['apiKey']) ? $decoded['apiKey'] : '';
$serverKey = getenv('ANTHROPIC_API_KEY') ?: (getenv('ANTHROPIC_KEY') ?: '');
$apiKey = $serverKey !== '' ? $serverKey : ($clientKey !== '' ? $clientKey : $bodyKey);

if ($apiKey === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing Anthropic API key'], JSON_UNESCAPED_UNICODE);
    exit;
}

$anthropicVersion = $_SERVER['HTTP_ANTHROPIC_VERSION'] ?? ($wrapped && isset($decoded['anthropicVersion']) && is_string($decoded['anthropicVersion']) ? $decoded['anthropicVersion'] : '2023-06-01');

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadBody);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: ' . $apiKey,
    'anthropic-version: ' . $anthropicVersion
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 90);

$responseBody = curl_exec($ch);
if ($responseBody === false) {
    $err = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    echo json_encode(['error' => 'Upstream fetch failed', 'details' => $err], JSON_UNESCAPED_UNICODE);
    exit;
}

$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
http_response_code($statusCode);
echo $responseBody;
