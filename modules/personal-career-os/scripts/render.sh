#!/usr/bin/env bash
# render.sh — 简历 HTML → PDF + PNG，并校验「一页纸」硬约束（macOS / Linux / Git Bash）
#
# 用法:
#   bash scripts/render.sh <input.html> [输出基名] [页数上限=1]
#   applications/ 下的投递产物必须传输出基名，且不含扩展名
#
# 依赖: Chrome / Chromium / Edge 任一；PNG 优先用 pdftoppm 从最终 PDF 生成
set -euo pipefail

HTML="${1:?用法: render.sh <input.html> [输出基名] [页数上限]}"
NAME="${2:-}"
MAX_PAGES="${3:-1}"
RENDER_TIMEOUT="${CAREER_OS_RENDER_TIMEOUT:-30}"
[ "$MAX_PAGES" -eq 1 ] || { echo "错误: 简历最终产物固定为一页，页数上限只能是 1" >&2; exit 2; }

# ── 定位输入输出 ──────────────────────────────────────────────
HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
OUT_DIR="$(dirname "$HTML_ABS")"
if [ -z "$NAME" ]; then
    case "$HTML_ABS" in
        */applications/*)
            echo "错误: 投递产物必须显式传入输出基名（按 JD 命名），禁止默认生成 resume.pdf" >&2
            exit 2
            ;;
        *) NAME="$(basename "$HTML_ABS" .html)" ;;
    esac
fi

case "$NAME" in
    .|..|*/*|*\\*)
        echo "错误: 输出基名不能包含路径或路径分隔符: $NAME" >&2
        exit 2
        ;;
    *.pdf|*.PDF|*.png|*.PNG|*.docx|*.DOCX)
        echo "错误: 输出基名不要包含 .docx/.pdf/.png 扩展名: $NAME" >&2
        exit 2
        ;;
esac
PDF="$OUT_DIR/$NAME.pdf"
PNG="$OUT_DIR/$NAME.png"

# file:// URL（只需处理空格；Git Bash 下用 cygpath 转成 Windows 形式）
if command -v cygpath >/dev/null 2>&1; then
    WIN_PATH="$(cygpath -m "$HTML_ABS")"          # C:/Users/.../resume.html
    FILE_URL="file:///${WIN_PATH// /%20}"
else
    FILE_URL="file://${HTML_ABS// /%20}"
fi

# ── 定位浏览器 ────────────────────────────────────────────────
BROWSER=""
for c in google-chrome chromium chromium-browser microsoft-edge msedge \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then BROWSER="$c"; break; fi
done
[ -z "$BROWSER" ] && { echo "错误: 未找到 Chrome/Chromium/Edge" >&2; exit 2; }

TMP_PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/career-os-browser.XXXXXX")"
cleanup() {
    rm -rf -- "$TMP_PROFILE"
}
trap cleanup EXIT INT TERM

BASE_ARGS=(
    --headless
    --disable-gpu
    --hide-scrollbars
    --disable-background-networking
    --disable-component-update
    "--user-data-dir=$TMP_PROFILE"
    --no-first-run
    --no-default-browser-check
)

# 某些 Chrome 版本产出文件后仍不退出。文件大小连续稳定后主动收口，
# 避免渲染任务挂住；超时且没有有效文件才判失败。
run_browser() {
    local expected="$1"
    shift
    local pid deadline status=0 last_size=0 current_size=0 stable_checks=0

    "$BROWSER" "${BASE_ARGS[@]}" "$@" >/dev/null 2>&1 &
    pid=$!
    deadline=$((SECONDS + RENDER_TIMEOUT))

    while kill -0 "$pid" 2>/dev/null; do
        if [ -s "$expected" ]; then
            current_size="$(wc -c < "$expected" | tr -d ' ')"
            if [ "$current_size" -eq "$last_size" ]; then
                stable_checks=$((stable_checks + 1))
            else
                last_size="$current_size"
                stable_checks=0
            fi
            if [ "$stable_checks" -ge 5 ]; then
                kill "$pid" 2>/dev/null || true
                wait "$pid" 2>/dev/null || true
                return 0
            fi
        fi

        if [ "$SECONDS" -ge "$deadline" ]; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            [ -s "$expected" ] && return 0
            echo "错误: 浏览器渲染超时，且未生成有效文件: $expected" >&2
            return 124
        fi
        sleep 0.2
    done

    wait "$pid" || status=$?
    if [ "$status" -ne 0 ] && [ ! -s "$expected" ]; then
        return "$status"
    fi
}

# ── 渲染 PDF ─────────────────────────────────────────────────
rm -f "$PDF" "$PNG"
run_browser "$PDF" --no-pdf-header-footer "--print-to-pdf=$PDF" "$FILE_URL"
[ -s "$PDF" ] || { echo "错误: PDF 渲染失败" >&2; exit 3; }

# ── 校验页数（一页纸硬约束） ─────────────────────────────────
PDFINFO="${CAREER_OS_PDFINFO:-}"
if [ -z "$PDFINFO" ] && command -v pdfinfo >/dev/null 2>&1; then PDFINFO="$(command -v pdfinfo)"; fi

PAGES=0
if [ -n "$PDFINFO" ]; then
    PAGES="$("$PDFINFO" "$PDF" 2>/dev/null | awk '/^Pages:/ {print $2; exit}')" || PAGES=0
fi
if [ "$PAGES" -le 0 ]; then
    PAGES="$(grep -aoE '/Type ?/Pages?' "$PDF" | grep -c 'Page$')" || PAGES=0
    [ -n "$PAGES" ] || PAGES=0
fi

if [ "$PAGES" -lt 1 ]; then
    echo "错误: 无法确认 PDF 页数；一页校验未通过。" >&2
    exit 4
elif [ "$PAGES" -gt "$MAX_PAGES" ]; then
    echo "错误: 内容超出 $MAX_PAGES 页（实际 $PAGES 页）！删减内容后重新渲染。" >&2
    exit 1
fi

# ── 从已校验 PDF 栅格化 PNG，避免屏幕截图与打印版式漂移 ──────
PDFTOPPM="${CAREER_OS_PDFTOPPM:-}"
if [ -z "$PDFTOPPM" ] && command -v pdftoppm >/dev/null 2>&1; then PDFTOPPM="$(command -v pdftoppm)"; fi

if [ -n "$PDFTOPPM" ]; then
    "$PDFTOPPM" -png -r 200 -f 1 -singlefile "$PDF" "$OUT_DIR/$NAME" >/dev/null 2>&1
elif command -v sips >/dev/null 2>&1; then
    sips -s format png "$PDF" --out "$PNG" >/dev/null
    sips -Z 2339 "$PNG" >/dev/null
else
    echo "错误: 缺少 pdftoppm（或 macOS sips），无法从最终 PDF 生成同版 PNG。" >&2
    exit 5
fi
[ -s "$PNG" ] || { echo "错误: PNG 栅格化失败" >&2; exit 3; }

echo "PDF : $PDF"
echo "PNG : $PNG"
echo "页数: $PAGES"
echo "✓ PDF/PNG 一页纸校验通过（PNG 与 PDF 同源）"
