$file = "e:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\html_version_v0.0.1\chart-analysis-new.html"
$content = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)

$content = $content -creplace '\?→\ufffd\u(\w{4})', {
    param($match)
    $code = [Convert]::ToInt32($match.Groups[1].Value, 16)
    [char]$code
}

# 깨진 닫기 태그 수정
$content = $content -replace '\?\?/div>', '</div>'
$content = $content -replace '\?/div>', '</div>'
$content = $content -replace '\?\?', ''

[IO.File]::WriteAllText($file, $content, [Text.UTF8Encoding]::new($false))
Write-Host "완료: UTF-8 인코딩 복구 완료"
