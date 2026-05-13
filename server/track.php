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
$indexFile = 'track/index.json';
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

function readIndex(): array {
    global $indexFile;

    if (file_exists($indexFile)) {
        $content = @file_get_contents($indexFile);
        if ($content !== false) {
            $data = json_decode($content, true);
            if (is_array($data)) return $data;
        }
    }

    return rebuildIndex();
}

function rebuildIndex(): array {
    global $projectDir, $indexFile;

    $index = [];

    if (is_dir($projectDir)) {
        foreach (glob($projectDir . '/*.json') as $file) {
            $basename = basename($file);
            if ($basename === 'index.json' || $basename === 'projects.json') continue;

            $fp = fopen($file, 'r');
            if (!$fp) continue;

            $buffer = '';
            $found = 0;
            $meta = ['id' => '', 'name' => '', 'lastModified' => 0];

            while (!feof($fp) && $found < 3 && strlen($buffer) < 8192) {
                $buffer .= fread($fp, 4096);
                if (preg_match('/"id"\s*:\s*"([^"]+)"/', $buffer, $m)) {
                    $meta['id'] = $m[1];
                    $found++;
                }
                if (preg_match('/"name"\s*:\s*"([^"]+)"/', $buffer, $m)) {
                    $meta['name'] = $m[1];
                    $found++;
                }
                if (preg_match('/"lastModified"\s*:\s*(\d+)/', $buffer, $m)) {
                    $meta['lastModified'] = (int)$m[1];
                    $found++;
                }
            }
            fclose($fp);

            if (empty($meta['id'])) {
                $meta['id'] = pathinfo($basename, PATHINFO_FILENAME);
            }
            if (empty($meta['name'])) {
                $meta['name'] = $meta['id'];
            }
            if (empty($meta['lastModified'])) {
                $mtime = @filemtime($file);
                $meta['lastModified'] = $mtime !== false ? $mtime : time();
            }

            $index[] = $meta;
        }
    }

    if (file_exists($projectDir . '/projects.json')) {
        $content = @file_get_contents($projectDir . '/projects.json');
        if ($content !== false) {
            $legacyData = json_decode($content, true);
            $list = $legacyData['projects'] ?? (is_array($legacyData) ? $legacyData : []);
            $loadedIds = array_column($index, 'id');

            foreach ($list as $p) {
                if (is_array($p) && isset($p['id']) && !in_array($p['id'], $loadedIds)) {
                    $index[] = [
                        'id' => $p['id'],
                        'name' => $p['name'] ?? $p['id'],
                        'lastModified' => $p['lastModified'] ?? time()
                    ];
                }
            }
        }
    }

    usort($index, fn($a, $b) => ($b['lastModified'] ?? 0) - ($a['lastModified'] ?? 0));

    @file_put_contents($indexFile, json_encode($index, JSON_UNESCAPED_UNICODE));
    @chmod($indexFile, 0666);

    return $index;
}

function updateIndexEntry(string $id, string $name, int $lastModified): void {
    global $indexFile;

    $index = readIndex();
    $found = false;

    foreach ($index as &$entry) {
        if ($entry['id'] === $id) {
            $entry['name'] = $name;
            $entry['lastModified'] = $lastModified;
            $found = true;
            break;
        }
    }
    unset($entry);

    if (!$found) {
        $index[] = ['id' => $id, 'name' => $name, 'lastModified' => $lastModified];
    }

    usort($index, fn($a, $b) => ($b['lastModified'] ?? 0) - ($a['lastModified'] ?? 0));

    @file_put_contents($indexFile, json_encode($index, JSON_UNESCAPED_UNICODE));
    @chmod($indexFile, 0666);
}

function removeIndexEntry(string $id): void {
    global $indexFile;

    $index = readIndex();
    $index = array_values(array_filter($index, fn($e) => $e['id'] !== $id));

    @file_put_contents($indexFile, json_encode($index, JSON_UNESCAPED_UNICODE));
    @chmod($indexFile, 0666);
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

    updateIndexEntry(
        $project['id'],
        $project['name'] ?? $project['id'],
        $project['lastModified'] ?? time()
    );
}

function deleteProject(string $id): void {
    global $projectDir;

    $id = sanitizeId($id);
    $filepath = $projectDir . '/' . $id . '.json';

    if (file_exists($filepath)) {
        unlink($filepath);
    }

    removeIndexEntry($id);
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
                    $bn = basename($f);
                    if ($bn !== 'index.json' && $bn !== 'projects.json') $count++;
                }
            }
            sendJson([
                'status' => 'online',
                'storage_mode' => 'track_folder',
                'project_count' => $count
            ]);
            break;

        case 'list':
            sendJson(readIndex());
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

        case 'reindex':
            sendJson(['success' => true, 'count' => count(rebuildIndex())]);
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
                'message' => 'API ready. Use ?action=list|get|save|delete|status|reindex',
                'storage_mode' => 'track_folder'
            ]);
            break;
    }
} catch (Exception $e) {
    sendError($e->getMessage());
}
