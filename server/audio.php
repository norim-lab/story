<?php
header('Content-Type: application/json; charset=utf-8');

ini_set('memory_limit', '2048M');
ini_set('max_execution_time', 120);

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
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$maxVersions = 3;

$audioDir = __DIR__ . '/audio';
if (!is_dir($audioDir)) {
    mkdir($audioDir, 0777, true);
    chmod($audioDir, 0777);
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

function getSlotDir(string $projectId, string $slot): string {
    global $audioDir;
    $dir = $audioDir . '/' . $projectId . '/' . $slot;
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
        chmod($dir, 0777);
    }
    return $dir;
}

function getVersions(string $dir): array {
    $versions = [];
    foreach (glob($dir . '/v_*.mp3') as $f) {
        if (preg_match('/v_(\d+)\.mp3$/', $f, $m)) {
            $versions[(int)$m[1]] = $f;
        }
    }
    foreach (glob($dir . '/v_*.wav') as $f) {
        if (preg_match('/v_(\d+)\.wav$/', $f, $m)) {
            $versions[(int)$m[1]] = $f;
        }
    }
    ksort($versions, SORT_NUMERIC);
    return $versions;
}

function cleanupOldVersions(string $dir, int $keepVersions): void {
    $versions = getVersions($dir);
    while (count($versions) > $keepVersions) {
        $oldestKey = array_key_first($versions);
        @unlink($versions[$oldestKey]);
        unset($versions[$oldestKey]);
    }
}

switch ($action) {
    case 'save':
        $projectId = $input['projectId'] ?? '';
        $slot = $input['slot'] ?? '';
        $stage = $input['stage'] ?? '';
        $audioBase64 = $input['audio'] ?? '';

        if (empty($projectId) || empty($slot) || empty($stage) || empty($audioBase64)) {
            echo json_encode(['success' => false, 'error' => 'Missing parameters']);
            exit;
        }

        $dir = getSlotDir($projectId, $slot . '_' . $stage);
        $versions = getVersions($dir);
        $nextVersion = empty($versions) ? 1 : ((int)array_key_last($versions) + 1);

        $audioData = $audioBase64;
        if (strpos($audioData, 'data:audio/') === 0) {
            $audioData = substr($audioData, strpos($audioData, ',') + 1);
        }
        $audioBinary = base64_decode($audioData);
        if ($audioBinary === false) {
            echo json_encode(['success' => false, 'error' => 'Invalid base64']);
            exit;
        }

        $ext = 'mp3';
        if (strpos($audioBase64, 'data:audio/wav') === 0) $ext = 'wav';

        $filePath = $dir . '/v_' . $nextVersion . '.' . $ext;
        file_put_contents($filePath, $audioBinary);
        chmod($filePath, 0666);

        cleanupOldVersions($dir, $keepVersions);

        echo json_encode([
            'success' => true,
            'version' => $nextVersion,
            'file' => $slot . '_' . $stage . '/v_' . $nextVersion . '.' . $ext
        ]);
        break;

    case 'list':
        $projectId = $input['projectId'] ?? $_GET['projectId'] ?? '';
        $slot = $input['slot'] ?? $_GET['slot'] ?? '';
        $stage = $input['stage'] ?? $_GET['stage'] ?? '';

        if (empty($projectId) || empty($slot) || empty($stage)) {
            echo json_encode(['success' => false, 'error' => 'Missing parameters']);
            exit;
        }

        $dir = getSlotDir($projectId, $slot . '_' . $stage);
        $versions = getVersions($dir);

        $result = [];
        foreach ($versions as $v => $path) {
            $result[] = [
                'version' => $v,
                'file' => basename($path),
                'size' => filesize($path),
                'time' => filemtime($path)
            ];
        }

        echo json_encode(['success' => true, 'versions' => array_reverse($result)]);
        break;

    case 'get':
        $projectId = $input['projectId'] ?? $_GET['projectId'] ?? '';
        $slot = $input['slot'] ?? $_GET['slot'] ?? '';
        $stage = $input['stage'] ?? $_GET['stage'] ?? '';
        $version = (int)($input['version'] ?? $_GET['version'] ?? 0);

        if (empty($projectId) || empty($slot) || empty($stage) || $version < 1) {
            echo json_encode(['success' => false, 'error' => 'Missing parameters']);
            exit;
        }

        $dir = getSlotDir($projectId, $slot . '_' . $stage);
        $versions = getVersions($dir);

        if (!isset($versions[$version])) {
            echo json_encode(['success' => false, 'error' => 'Version not found']);
            exit;
        }

        $filePath = $versions[$version];
        $mime = strpos($filePath, '.wav') !== false ? 'audio/wav' : 'audio/mpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        break;

    case 'cleanup_project':
        $projectId = $input['projectId'] ?? $_GET['projectId'] ?? '';

        if (empty($projectId)) {
            echo json_encode(['success' => false, 'error' => 'Missing projectId']);
            exit;
        }

        $projectDir = $audioDir . '/' . $projectId;
        if (!is_dir($projectDir)) {
            echo json_encode(['success' => true, 'cleaned' => 0]);
            exit;
        }

        $cleaned = 0;
        foreach (glob($projectDir . '/*', GLOB_ONLYDIR) as $slotDir) {
            $versions = getVersions($slotDir);
            foreach ($versions as $v => $path) {
                @unlink($path);
                $cleaned++;
            }
            @rmdir($slotDir);
        }
        @rmdir($projectDir);

        echo json_encode(['success' => true, 'cleaned' => $cleaned]);
        break;

    case 'cleanup_all':
        $cleaned = 0;
    foreach (glob($audioDir . '/*', GLOB_ONLYDIR) as $projectDir) {
        foreach (glob($projectDir . '/*', GLOB_ONLYDIR) as $slotDir) {
            cleanupOldVersions($slotDir, $keepVersions);
            $versions = getVersions($slotDir);
            if (empty($versions)) {
                @rmdir($slotDir);
                $cleaned++;
            }
        }
    }

    echo json_encode(['success' => true, 'cleaned' => $cleaned]);
        break;

    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action: ' . $action]);
}
