"""
Simple script to clean up chart-analysis-new.html by removing duplicate content after line 1557
"""

file_path = r"e:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\html_version_v0.0.1\chart-analysis-new.html"

# Read all lines
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the first </html> tag
html_close_index = None
for i, line in enumerate(lines):
    if '</html>' in line:
        html_close_index = i
        break

if html_close_index is not None:
    # Keep only lines up to and including the first </html>
    cleaned_lines = lines[:html_close_index + 1]
    
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(cleaned_lines)
    
    print(f"✅ File cleaned! Removed {len(lines) - len(cleaned_lines)} lines of duplicate content")
    print(f"   Original: {len(lines)} lines")
    print(f"   Cleaned: {len(cleaned_lines)} lines")
else:
    print("❌ Could not find </html> tag")
