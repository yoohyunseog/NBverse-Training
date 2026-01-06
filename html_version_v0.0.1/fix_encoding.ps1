# UTF-8 인코딩 문제 일괄 수정 스크립트

$filePath = "e:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\html_version_v0.0.1\chart-analysis-new.html"

# UTF-8로 파일 읽기
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

# 모든 깨진 패턴을 올바른 텍스트로 치환
$replacements = @{
    '?\ufffd\ufffd\ub85c?\ufffd\ufffd\ucc28?\ufffd\?' = '플로우차트'
    '?\ufffd\ufffd\uc774?\ufffd\?' = '데이터'
    '?\ufffd\ufffd\uc9d1' = '수집'
    '?\ufffd\ufffd\ub85c?\ufffd\?' = '플로우'
    '?\ufffd\ufffd\uacc4' = '단계'
    '?\ufffd\ufffd\uc791' = '시작'
    '?\ufffd\ufffd\uccad' = '요청'
    '?\ufffd\ufffd\ufffd' = '🌐'
    'API ?\ufffd\ufffd\ucd9c' = 'API 호출'
    '?\ufffd\ufffd\uc2e0' = '수신'
    '?\ufffd\ufffd\uc2f1' = '파싱'
    '?\ufffd\ufffd??' = '검증'
    '?\ufffd\ufffd\ub8cc' = '완료'
    '?\ufffd\ufffd\uc74c ?\ufffd\ufffd\uacc4?\ufffd\?' = '다음 단계로'
    '?\ufffd\ufffd\uce21' = '우측'
    '?\ufffd\ufffd\ucd9c' = '호출'
    '?\ufffd\ufffd\uc791?\ufffd\ufffd\uba74' = '시작하면'
    '?\ufffd\ufffd\uc2dc?\ufffd\ufffd\ub2c8?\ufffd\?' = '표시됩니다'
    '?\ufffd\ufffd\uc9d1?\ufffd\ufffd' = '수집된'
    '?\ufffd\ufffd\uc2dc' = '원시'
    '?\ufffd\ufffd\ub85c?\ufffd\ufffd' = '플로우'
    '?\ufffd\ufffd?\ufffd\?' = '완료'
    '?\ufffd\ufffd\uc5ed' = '영역'
    '?\ufffd\ufffd\uc158' = '섹션'
    '?\ufffd\ufffd\ud0dd' = '선택'
    '?\ufffd\?' = '분'
    '?\ufffd\ufffd?' = '일'
    '?\ufffd\ufffd\ub3d9' = '자동'
    '?\ufffd\ufffd\ud68c' = '순회'
    '?\ufffd\ufffd\uc0b0' = '자산'
    '?\ufffd\ufffd\ubcf4' = '정보'
    '�?\ufffd\ufffd\uc0b0' = '총 자산'
    '?\ufffd\ufffd\ub2f5 ?\ufffd\ufffd\uac04' = '응답 시간'
    '?\ufffd\ufffd\uba74 ?\ufffd\ufffd\uae30?\ufffd\?' = '하면 여기에'
    '?\ufffd\ufffd\uc2e4?\ufffd\?' = '실행중'
    '?\ufffd\ufffd\ufffd?\ufffd\ufffd' = '대기중'
    '계산 ?\ufffd\ufffd\uc791' = '계산 시작'
    '?\ufffd\ufffd\uc900?\ufffd\?' = '준비'
    '?\ufffd\ufffd\ucc98?\ufffd\?' = '전처리'
    '?\ufffd\ufffd\ud589' = '실행'
    '?\ufffd\ufffd\uc1a1' = '전송'
    '?\ufffd\ufffd??' = '저장'
    '?\ufffd\ufffd\uc815' = '저장'
    '?\ufffd\ufffd\ufffd?' = '대기'
}

foreach ($key in $replacements.Keys) {
    $content = $content -replace [regex]::Escape($key), $replacements[$key]
}

# UTF-8 BOM 없이 저장
[System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "인코딩 수정 완료!" -ForegroundColor Green
