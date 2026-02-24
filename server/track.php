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
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$projectDir = 'track';
$filePattern = '*.json';

function sendJson(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function sendError(string $message, int $code = 500): void {
    sendJson(['error' => $message, 'success' => false], $code);
}

function sanitizeId(string $id): string {
    return preg_replace('/[^a-zA-Z0-9\-_]/', '', $id);
}

function loadProjects(): array {
    global $projectDir, $filePattern;
    
    $projects = [];
    $loadedIds = [];
    
    if (is_dir($projectDir)) {
        foreach (glob($projectDir . '/' . $filePattern) as $file) {
            $basename = basename($file);
            if ($basename === 'projects.json') continue;
            
            $content = @file_get_contents($file);
            if ($content === false) continue;
            
            $data = json_decode($content, true);
            if (!is_array($data)) $data = [];
            
            $inferredId = pathinfo($basename, PATHINFO_FILENAME);
            $data['id'] = isset($data['id']) && $data['id'] !== '' ? sanitizeId($data['id']) : sanitizeId($inferredId);
            
            if (!isset($loadedIds[$data['id']])) {
                if (!isset($data['lastModified'])) {
                    $mtime = @filemtime($file);
                    $data['lastModified'] = $mtime !== false ? $mtime : time();
                }
                if (!isset($data['name']) || $data['name'] === '') {
                    $data['name'] = $data['id'];
                }
                $projects[] = $data;
                $loadedIds[$data['id']] = true;
            }
        }
    }
    
    if (file_exists($projectDir . '/projects.json')) {
        $legacy = @file_get_contents($projectDir . '/projects.json');
        if ($legacy !== false) {
            $legacyData = json_decode($legacy, true);
            $list = $legacyData['projects'] ?? (is_array($legacyData) ? $legacyData : []);
            
            foreach ($list as $p) {
                if (is_array($p) && isset($p['id']) && !isset($loadedIds[$p['id']])) {
                    $projects[] = $p;
                    $loadedIds[$p['id']] = true;
                }
            }
        }
    }
    
    usort($projects, fn($a, $b) => ($b['lastModified'] ?? 0) - ($a['lastModified'] ?? 0));
    
    return $projects;
}

function saveProject(array $project): void {
    global $projectDir;
    
    error_log("=== SAVE PROJECT START ===");
    error_log("Project ID: " . ($project['id'] ?? 'null'));
    error_log("Project Dir: " . $projectDir);
    error_log("Is Dir: " . (is_dir($projectDir) ? 'yes' : 'no'));
    error_log("Current Dir: " . getcwd());
    
    if (!isset($project['id']) || empty($project['id'])) {
        throw new Exception("Projekt hat keine ID");
    }
    
    $project['id'] = sanitizeId($project['id']);
    
    if (!is_dir($projectDir)) {
        error_log("Creating directory...");
        if (!mkdir($projectDir, 0777, true)) {
            $error = error_get_last();
            error_log("Mkdir failed: " . ($error['message'] ?? 'unknown'));
            throw new Exception("Verzeichnis konnte nicht erstellt werden");
        }
        chmod($projectDir, 0777);
        error_log("Directory created and chmodded");
    }
    
    error_log("Directory writable: " . (is_writable($projectDir) ? 'yes' : 'no'));
    error_log("Directory permissions: " . substr(sprintf('%o', fileperms($projectDir)), -4));
    
    if (!is_writable($projectDir)) {
        throw new Exception("Verzeichnis ist nicht beschreibbar");
    }
    
    $filepath = $projectDir . '/' . $project['id'] . '.json';
    $json = json_encode($project, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
    error_log("Target filepath: " . $filepath);
    error_log("JSON length: " . strlen($json));
    
    $result = file_put_contents($filepath, $json);
    error_log("File put contents result: " . ($result === false ? 'false' : $result . ' bytes'));
    
    if ($result === false) {
        $error = error_get_last();
        error_log("File write error: " . ($error['message'] ?? 'unknown'));
        throw new Exception("Fehler beim Speichern der Datei: " . ($error['message'] ?? 'unknown'));
    }
    
    chmod($filepath, 0666);
    error_log("File saved successfully");
    error_log("=== SAVE PROJECT END ===");
}

function deleteProject(string $id): void {
    global $projectDir;
    
    $id = sanitizeId($id);
    $filepath = $projectDir . '/' . $id . '.json';
    
    if (file_exists($filepath)) {
        unlink($filepath);
    }
    
    if (file_exists($projectDir . '/projects.json')) {
        $content = @file_get_contents($projectDir . '/projects.json');
        if ($content !== false) {
            $data = json_decode($content, true);
            $list = $data['projects'] ?? (is_array($data) ? $data : []);
            $newList = array_filter($list, fn($p) => !isset($p['id']) || $p['id'] !== $id);
            
            if (count($newList) !== count($list)) {
                file_put_contents($projectDir . '/projects.json', json_encode(array_values($newList), JSON_PRETTY_PRINT));
            }
        }
    }
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    switch ($action) {
        case 'status':
            sendJson([
                'status' => 'online',
                'storage_mode' => 'track_folder',
                'project_count' => count(loadProjects())
            ]);
            break;
            
        case 'list':
            sendJson(loadProjects());
            break;
            
        case 'save':
            $input = file_get_contents('php://input');
            
            if (empty($input)) {
                sendError("Keine Projektdaten empfangen", 400);
            }
            
            $data = json_decode($input, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                sendError("Ungültiges JSON: " . json_last_error_msg(), 400);
            }
            
            // Projektdaten extrahieren (aus {action: "save", project: {...}})
            $project = isset($data['project']) ? $data['project'] : $data;
            
            if (!is_array($project)) {
                sendError("Ungültige Projektdaten", 400);
            }
            
            saveProject($project);
            sendJson(['success' => true, 'id' => $project['id']]);
            break;
            
        case 'delete':
            $id = sanitizeId($_GET['id'] ?? $_POST['id'] ?? '');
            
            if (empty($id)) {
                sendError("Keine ID angegeben", 400);
            }
            
            deleteProject($id);
            sendJson(['success' => true]);
            break;
            
        default:
            sendJson([
                'status' => 'ready',
                'message' => 'API ready. Use ?action=list|save|delete|status',
                'storage_mode' => 'track_folder'
            ]);
            break;
    }
} catch (Exception $e) {
    sendError($e->getMessage());
}
