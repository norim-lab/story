<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$PRESETS = [
    'zeitblytz_standard' => [
        'silence_threshold' => -40.0,
        'min_silence_duration' => 0.30,
        'target_silence_duration' => 0.15,
        'speed' => 1.12,
    ],
    'aggressiv' => [
        'silence_threshold' => -45.0,
        'min_silence_duration' => 0.22,
        'target_silence_duration' => 0.08,
        'speed' => 1.18,
    ],
    'voiceover_turbo' => [
        'silence_threshold' => -43.0,
        'min_silence_duration' => 0.20,
        'target_silence_duration' => 0.10,
        'speed' => 1.20,
    ],
];

function findFfmpeg(): string {
    $path = getenv('FFMPEG_PATH') ?: '';
    if (!empty($path) && is_executable($path)) return $path;
    $which = trim(shell_exec('which ffmpeg 2>/dev/null') ?: '');
    if (!empty($which) && is_executable($which)) return $which;
    foreach (['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/ffmpeg/ffmpeg'] as $c) {
        if (is_executable($c)) return $c;
    }
    return '';
}

function buildAtempoChain(float $speed): string {
    if ($speed <= 2.0) return 'atempo=' . number_format($speed, 4);
    $remaining = $speed;
    $parts = [];
    while ($remaining > 2.0) {
        $parts[] = 'atempo=2.0';
        $remaining /= 2.0;
    }
    $parts[] = 'atempo=' . number_format($remaining, 4);
    return implode(',', $parts);
}

function getAudioDuration(string $ffmpeg, string $file): float {
    $cmd = escapeshellcmd($ffmpeg) . ' -i ' . escapeshellarg($file) . ' -f null - 2>&1';
    exec($cmd, $out);
    foreach ($out as $line) {
        if (preg_match('/Duration:\s*([\d:.]+)/', $line, $m)) {
            $p = explode(':', $m[1]);
            return floatval($p[0]) * 3600 + floatval($p[1]) * 60 + floatval($p[2]);
        }
    }
    return 0.0;
}

function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (glob($dir . '/*') as $f) @unlink($f);
    @rmdir($dir);
}

$ffmpegPath = findFfmpeg();
if (empty($ffmpegPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'FFmpeg nicht gefunden']);
    exit;
}

$tmpDir = null;

try {
    $preset = $_POST['preset'] ?? '';
    $silenceThreshold = isset($_POST['silence_threshold']) ? floatval($_POST['silence_threshold']) : -40.0;
    $minSilenceDuration = isset($_POST['min_silence_duration']) ? floatval($_POST['min_silence_duration']) : 0.30;
    $targetSilenceDuration = isset($_POST['target_silence_duration']) ? floatval($_POST['target_silence_duration']) : 0.15;
    $speed = isset($_POST['speed']) ? floatval($_POST['speed']) : 1.12;

    if (!empty($preset) && isset($PRESETS[$preset])) {
        $p = $PRESETS[$preset];
        $silenceThreshold = $p['silence_threshold'];
        $minSilenceDuration = $p['min_silence_duration'];
        $targetSilenceDuration = $p['target_silence_duration'];
        $speed = $p['speed'];
    }

    if ($speed <= 0 || $speed > 4.0) {
        throw new Exception('Speed muss zwischen 0.5 und 4.0 liegen');
    }

    $tmpDir = sys_get_temp_dir() . '/speedup_' . uniqid();
    mkdir($tmpDir, 0777, true);
    chmod($tmpDir, 0777);

    $inputFile = $tmpDir . '/input.mp3';

    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION);
        $inputFile = $tmpDir . '/input.' . ($ext ?: 'mp3');
        move_uploaded_file($_FILES['file']['tmp_name'], $inputFile);
    } elseif (!empty($_POST['audio_base64'])) {
        $base64 = $_POST['audio_base64'];
        if (strpos($base64, 'data:') === 0) {
            $base64 = substr($base64, strpos($base64, ',') + 1);
        }
        $audioData = base64_decode($base64);
        if ($audioData === false) throw new Exception('Ungueltige Base64-Audiodaten');
        file_put_contents($inputFile, $audioData);
    } else {
        throw new Exception('Kein Audio-Input (file oder audio_base64 erforderlich)');
    }
    chmod($inputFile, 0666);

    $originalDuration = getAudioDuration($ffmpegPath, $inputFile);

    $silenceDetectCmd = escapeshellcmd($ffmpegPath) . ' -i ' . escapeshellarg($inputFile)
        . ' -af ' . escapeshellarg('silencedetect=noise=' . $silenceThreshold . 'dB:d=' . $minSilenceDuration)
        . ' -f null - 2>&1';
    exec($silenceDetectCmd, $silenceOut);

    $silenceStarts = [];
    $silenceEnds = [];
    foreach ($silenceOut as $line) {
        if (preg_match('/silence_start:\s*([\d.]+)/', $line, $m)) $silenceStarts[] = floatval($m[1]);
        if (preg_match('/silence_end:\s*([\d.]+)/', $line, $m)) $silenceEnds[] = floatval($m[1]);
    }

    $silencePaddingSec = 0.12;
    $numSilences = min(count($silenceStarts), count($silenceEnds));
    $shortenedCount = 0;
    $trimmedFile = $tmpDir . '/trimmed.mp3';

    if ($numSilences > 0) {
        $segments = [];
        $lastEnd = 0.0;

        for ($i = 0; $i < $numSilences; $i++) {
            $rawSilStart = $silenceStarts[$i];
            $rawSilEnd = $silenceEnds[$i];
            $silStart = min($rawSilStart + $silencePaddingSec, $rawSilEnd);
            $silEnd = max($rawSilEnd - $silencePaddingSec, $silStart);
            $silDurSec = $silEnd - $silStart;

            if ($silDurSec * 1000 > $targetSilenceDuration * 1000) {
                if ($silStart > $lastEnd + 0.001) {
                    $segments[] = ['start' => $lastEnd, 'end' => $silStart, 'silence' => false];
                }
                $center = ($rawSilStart + $rawSilEnd) / 2;
                $bodyStart = $center - $targetSilenceDuration / 2;
                $bodyEnd = $bodyStart + $targetSilenceDuration;
                $segments[] = [
                    'silence' => true,
                    'src_start' => $bodyStart,
                    'src_end' => $bodyEnd,
                ];
                $lastEnd = $silEnd;
                $shortenedCount++;
            } elseif ($silDurSec > 0.001) {
                if ($silStart > $lastEnd + 0.001) {
                    $segments[] = ['start' => $lastEnd, 'end' => $silStart, 'silence' => false];
                }
                $segments[] = ['start' => $silStart, 'end' => $silEnd, 'silence' => true];
                $lastEnd = $silEnd;
            }
        }

        if ($originalDuration > $lastEnd + 0.001) {
            $segments[] = ['start' => $lastEnd, 'end' => $originalDuration + 0.1, 'silence' => false];
        }

        if (count($segments) > 0) {
            foreach ($segments as $idx => $seg) {
                $segFile = $tmpDir . '/seg_' . sprintf('%04d', $idx) . '.mp3';

                if (!empty($seg['src_start'])) {
                    $segCmd = escapeshellcmd($ffmpegPath) . ' -y'
                        . ' -i ' . escapeshellarg($inputFile)
                        . ' -ss ' . escapeshellarg(number_format($seg['src_start'], 6))
                        . ' -to ' . escapeshellarg(number_format($seg['src_end'], 6))
                        . ' -c:a libmp3lame -b:a 192k '
                        . escapeshellarg($segFile) . ' 2>&1';
                } else {
                    $segCmd = escapeshellcmd($ffmpegPath) . ' -y'
                        . ' -i ' . escapeshellarg($inputFile)
                        . ' -ss ' . escapeshellarg(number_format($seg['start'], 6))
                        . ' -to ' . escapeshellarg(number_format($seg['end'], 6))
                        . ' -c:a libmp3lame -b:a 192k '
                        . escapeshellarg($segFile) . ' 2>&1';
                }
                exec($segCmd);
            }

            $concatListFile = $tmpDir . '/concat.txt';
            $concatContent = '';
            $segFiles = glob($tmpDir . '/seg_*.mp3');
            sort($segFiles);
            foreach ($segFiles as $sf) {
                if (file_exists($sf) && filesize($sf) > 0) {
                    $concatContent .= "file '" . $sf . "'\n";
                }
            }
            file_put_contents($concatListFile, $concatContent);

            $concatCmd = escapeshellcmd($ffmpegPath) . ' -y'
                . ' -f concat -safe 0'
                . ' -i ' . escapeshellarg($concatListFile)
                . ' -c:a libmp3lame -b:a 192k '
                . escapeshellarg($trimmedFile) . ' 2>&1';
            exec($concatCmd);

            if (file_exists($trimmedFile) && filesize($trimmedFile) > 0) {
                $inputFile = $trimmedFile;
            }
        }
    }

    $outputFile = $tmpDir . '/output_processed.mp3';

    if (abs($speed - 1.0) > 0.001) {
        $atempoFilter = buildAtempoChain($speed);
        $speedCmd = escapeshellcmd($ffmpegPath) . ' -y'
            . ' -i ' . escapeshellarg($inputFile)
            . ' -filter:a ' . escapeshellarg($atempoFilter)
            . ' -c:a libmp3lame -b:a 192k '
            . escapeshellarg($outputFile) . ' 2>&1';
        exec($speedCmd);
    } else {
        copy($inputFile, $outputFile);
    }

    if (!file_exists($outputFile) || filesize($outputFile) === 0) {
        throw new Exception('FFmpeg hat keine Ausgabedatei erstellt');
    }
    chmod($outputFile, 0666);

    $processedDuration = getAudioDuration($ffmpegPath, $outputFile);

    $audioData = file_get_contents($outputFile);
    $base64Result = 'data:audio/mpeg;base64,' . base64_encode($audioData);

    echo json_encode([
        'success' => true,
        'audio_base64' => $base64Result,
        'stats' => [
            'silences_detected' => $numSilences,
            'silences_shortened' => $shortenedCount,
            'speed_applied' => $speed,
            'original_duration' => round($originalDuration, 2),
            'processed_duration' => round($processedDuration, 2),
        ],
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

if ($tmpDir) rrmdir($tmpDir);
