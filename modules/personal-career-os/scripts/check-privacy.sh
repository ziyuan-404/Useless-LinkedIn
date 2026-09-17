#!/usr/bin/env bash
# 检查 Personal Career OS 用户工作区中的常见敏感信息。
# 用法: bash scripts/check-privacy.sh [workspace-root] [-v|--verbose]

set -euo pipefail

ROOT="."
VERBOSE=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -v|--verbose)
            VERBOSE=true
            ;;
        *)
            ROOT="$1"
            ;;
    esac
    shift
done

if [ ! -d "$ROOT" ]; then
    echo "错误: 工作区不存在: $ROOT" >&2
    exit 2
fi

ROOT_ABS="$(cd "$ROOT" && pwd)"
CHECK_PATHS=(
    "$ROOT_ABS/profile"
    "$ROOT_ABS/template"
    "$ROOT_ABS/applications"
    "$ROOT_ABS/archive"
)

ERROR_COUNT=0
WARNING_COUNT=0
FILES_CHECKED=0

echo "=== Personal Career OS 脱敏检查 ==="
echo "工作区: $ROOT_ABS"
echo "检查中..."

check_file() {
    local file_path="$1"
    local rel_path="${file_path#"$ROOT_ABS"/}"
    local content
    local has_issues=false
    local real_emails

    case "$file_path" in
        *.docx)
            if ! command -v unzip >/dev/null 2>&1; then
                echo "  [警告] $rel_path: 缺少 unzip，未能检查 DOCX 内容"
                WARNING_COUNT=$((WARNING_COUNT + 1))
                return
            fi
            content="$({
                unzip -p "$file_path" word/document.xml 2>/dev/null || true
                unzip -p "$file_path" word/comments.xml 2>/dev/null || true
                unzip -p "$file_path" docProps/core.xml 2>/dev/null || true
            } | sed -E 's/<[^>]+>/ /g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&#39;/'"'"'/g')"
            FILES_CHECKED=$((FILES_CHECKED + 1))
            ;;
        *.png|*.jpg|*.jpeg|*.pdf|*.zip)
            return
            ;;
        *)
            if ! file "$file_path" | grep -q "text"; then
                return
            fi
            content="$(LC_ALL=C cat "$file_path")"
            FILES_CHECKED=$((FILES_CHECKED + 1))
            ;;
    esac

    if printf '%s' "$content" | grep -qE '\b1[3-9][0-9]{9}\b'; then
        echo "  [错误] $rel_path: 发现手机号"
        ERROR_COUNT=$((ERROR_COUNT + 1))
        has_issues=true
        if [ "$VERBOSE" = true ]; then
            printf '%s\n' "$content" | grep -nE '\b1[3-9][0-9]{9}\b' | head -3 | sed 's/^/    /'
        fi
    fi

    real_emails="$(printf '%s' "$content" \
        | grep -oE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b' \
        | grep -vE 'example\.com|test\.com|demo\.com|placeholder' || true)"
    if [ -n "$real_emails" ]; then
        echo "  [警告] $rel_path: 疑似真实邮箱"
        WARNING_COUNT=$((WARNING_COUNT + 1))
        has_issues=true
        if [ "$VERBOSE" = true ]; then
            printf '%s\n' "$real_emails" | head -3 | sed 's/^/    /'
        fi
    fi

    if printf '%s' "$content" | grep -qE '\b[0-9]{17}[0-9Xx]\b'; then
        echo "  [错误] $rel_path: 发现身份证号"
        ERROR_COUNT=$((ERROR_COUNT + 1))
        has_issues=true
    fi

    if printf '%s' "$content" | grep -qE '\b[0-9]{16,19}\b'; then
        echo "  [警告] $rel_path: 疑似银行卡号（16-19 位数字）"
        WARNING_COUNT=$((WARNING_COUNT + 1))
        has_issues=true
    fi

    if [ "$has_issues" = true ]; then
        echo
    fi
}

for path in "${CHECK_PATHS[@]}"; do
    if [ -d "$path" ]; then
        while IFS= read -r -d '' file_path; do
            check_file "$file_path"
        done < <(find "$path" -type f -print0)
    elif [ -f "$path" ]; then
        check_file "$path"
    fi
done

echo "=== 检查结果 ==="
echo "已检查文件: $FILES_CHECKED 个"

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "[失败] 发现 $ERROR_COUNT 个错误，$WARNING_COUNT 个警告"
    exit 1
elif [ "$WARNING_COUNT" -gt 0 ]; then
    echo "[警告] 发现 $WARNING_COUNT 个警告；公开分享前请人工确认。"
    exit 0
else
    echo "[通过] 未发现敏感信息"
    exit 0
fi
