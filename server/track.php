<?php
header('Content-Type: application/json; charset=utf-8');

ini_set('memory_limit', '512M');
ini_set('max_execution_time', 60);

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

$audioFields = ['speedupAudio', 'auphonicAudio', 'elevenLabsAudio', 'audioBase64'];

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

function stripAudioData(array $project): array {
    global $audioFields;

    foreach ($audioFields as $field) {
        if (isset($project[$field])) {
            if (is_array($project[$field])) {
                foreach ($project[$field] as $key => $value) {
                    if (is_string($value) && strlen($value) > 200) {
                        $project[$field][$key] = '__STRIPPED__';
                    }
                }
            } elseif (is_string($project[$field]) && strlen($project[$field]) > 200) {
                $project[$field] = '__STRIPPED__';
            }
        }
    }

    if (isset($project['scriptResult']) && is_array($project['scriptResult'])) {
        if (isset($project['scriptResult']['sections']) && is_array($project['scriptResult']['sections'])) {
            foreach ($project['scriptResult']['sections'] as $sIdx => $section) {
                if (!is_array($section)) continue;
                foreach ($audioFields as $field) {
                    if (isset($section[$field]) && is_array($section[$field])) {
                        foreach ($section[$field] as $key => $value) {
                            if (is_string($value) && strlen($value) > 200) {
                                $project['scriptResult']['sections'][$sIdx][$field][$key] = '__STRIPPED__';
                            }
                        }
                    }
                }
            }
        }
    }

    return $project;
}

function loadProjects(bool $stripAudio = false): array {
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
            if (!is_array($data)) {
                error_log("track.php: Invalid JSON in {$basename}, skipping");
                $data = [];
            }

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
                if ($stripAudio) {
                    $data = stripAudioData($data);
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
                    if ($stripAudio) {
                        $p = stripAudioData($p);
                    }
                    $projects[] = $p;
                    $loadedIds[$p['id']] = true;
                }
            }
        }
    }

    usort($projects, fn($a, $b) => ($b['lastModified'] ?? 0) - ($a['lastModified'] ?? 0));

    return $projects;
}

function loadSingleProject(string $id): ?array {
    global $projectDir;

    $id = sanitizeId($id);
    $filepath = $projectDir . '/' . $id . '.json';

    if (!file_exists($filepath)) return null;

    $content = @file_get_contents($filepath);
    if ($content === false) return null;

    $data = json_decode($content, true);
    if (!is_array($data)) return null;

    $data['id'] = $id;
    return $data;
}

function saveProject(array $project): void {
    global $projectDir;

    if (!isset($project['id']) || empty($project['id'])) {
        throw new Exception("Projekt hat keine ID");
    }

    $project['id'] = sanitizeId($project['id']);

    if (!is_dir($projectDir)) {
        if (!mkdir($projectDir, 0777, true)) {
            throw new Exception("Verzeichnis konnte nicht erstellt werden");
        }
        chmod($projectDir, 0777);
    }

    if (!is_writable($projectDir)) {
        throw new Exception("Verzeichnis ist nicht beschreibbar");
    }

    $filepath = $projectDir . '/' . $project['id'] . '.json';
    $json = json_encode($project, JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        throw new Exception("JSON Encoding fehlgeschlagen: " . json_last_error_msg());
    }

    $result = file_put_contents($filepath, $json);

    if ($result === false) {
        $error = error_get_last();
        throw new Exception("Fehler beim Speichern der Datei: " . ($error['message'] ?? 'unknown'));
    }

    chmod($filepath, 0666);
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
                file_put_contents($projectDir . '/projects.json', json_encode(array_values($newList)));
            }
        }
    }
}

$input = file_get_contents('php://input');
$data = $input ? json_decode($input, true) : [];
$action = $_GET['action'] ?? $_POST['action'] ?? ($data['action'] ?? '');

try {
    switch ($action) {
        case 'status':
            $count = 0;
            if (is_dir($projectDir)) {
                foreach (glob($projectDir . '/' . $filePattern) as $f) {
                    if (basename($f) !== 'projects.json') $count++;
                }
            }
            sendJson([
                'status' => 'online',
                'storage_mode' => 'track_folder',
                'project_count' => $count
            ]);
            break;

        case 'list':
            sendJson(loadProjects(true));
            break;

        case 'get':
            $id = sanitizeId($_GET['id'] ?? '');
            if (empty($id)) {
                sendError("Keine ID angegeben", 400);
            }
            $project = loadSingleProject($id);
            if ($project === null) {
                sendError("Projekt nicht gefunden", 404);
            }
            sendJson($project);
            break;

        case 'save':
            $input = file_get_contents('php://input');

            if (empty($input)) {
                sendError("Keine Projektdaten empfangen", 400);
            }

            $data = json_decode($input, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                sendError("Ungueltiges JSON: " . json_last_error_msg(), 400);
            }

            $project = isset($data['project']) ? $data['project'] : $data;

            if (!is_array($project)) {
                sendError("Ungueltige Projektdaten", 400);
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
                'message' => 'API ready. Use ?action=list|get|save|delete|status',
                'storage_mode' => 'track_folder'
            ]);
            break;
    }
} catch (Exception $e) {
    sendError($e->getMessage());
}
