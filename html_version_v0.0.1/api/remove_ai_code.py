#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 관련 코드 제거 스크립트"""

import re

# 파일 읽기
with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 각 AI 엔드포인트에서 410 반환 후의 모든 코드 제거
ai_endpoints = [
    r'/api/ai/analyze-chart',
    r'/api/ai/analyze-rl',
    r'/api/ai/rl-info',
    r'/api/ai/rl-statistics',
    r'/api/ai/rl-statistics/<card_id>',
    r'/api/ai/learn-from-verification',
    r'/api/ai/execute-rl-action',
    r'/api/ai/predict'
]

for endpoint in ai_endpoints:
    # 410 반환 후 다음 함수/주석까지의 모든 코드 제거
    pattern = rf'(@app\.route\([\'"]{re.escape(endpoint)}[\'"][^)]*\)\s+def\s+\w+\([^)]*\):\s*"""[^"]*"""\s*return\s+jsonify\([^)]+\)\s*,\s*410\s*)(.*?)(?=\n#\s|@app\.route|def\s+\w+\(|$)'
    content = re.sub(pattern, r'\1', content, flags=re.DOTALL)

# 파일 쓰기
with open('app.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ AI 관련 코드 제거 완료")
