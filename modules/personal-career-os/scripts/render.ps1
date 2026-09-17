# render.ps1 — 简历 HTML → PDF + 同源 PNG，并校验「一页纸」硬约束
#
# 用法:
#   pwsh scripts/render.ps1 -Html template/resume.html
#   pwsh scripts/render.ps1 -Html "applications/2026-07-05-某公司-某岗位/resume.html" -Name "学校-姓名-专业-年级"
#
# 参数:
#   -Html     输入的 HTML 文件（必填）
#   -OutDir   输出目录（默认与 HTML 同目录）
#   -Name     输出文件基名（不含扩展名；applications/ 下必填，按 JD 要求命名）
#   -MaxPages 兼容参数，简历固定只能传 1
#
# 依赖: Microsoft Edge；PNG 另需 pdftoppm 或 ImageMagick

param(
    [Parameter(Mandatory = $true)][string]$Html,
    [string]$OutDir,
    [string]$Name,
    [int]$MaxPages = 1
)

$ErrorActionPreference = 'Stop'
if ($MaxPages -ne 1) { throw '简历最终产物固定为一页，MaxPages 只能是 1。' }

# ── 定位输入输出 ──────────────────────────────────────────────
$htmlPath = (Resolve-Path -LiteralPath $Html).Path
if (-not $OutDir) { $OutDir = Split-Path -Parent $htmlPath }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
if (-not $Name) {
    if ($htmlPath -match '[\\/]applications[\\/]') {
        throw '投递产物必须显式传入 -Name（按 JD 命名），禁止默认生成 resume.pdf。'
    }
    $Name = [IO.Path]::GetFileNameWithoutExtension($htmlPath)
}
if ($Name -in @('.', '..') -or $Name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $Name.Contains('/') -or $Name.Contains('\')) {
    throw "输出基名不能包含路径或操作系统禁用字符: $Name"
}
if ($Name -match '\.(docx|pdf|png)$') {
    throw "输出基名不要包含 .docx/.pdf/.png 扩展名: $Name"
}

$pdfPath = Join-Path $OutDir "$Name.pdf"
$pngPath = Join-Path $OutDir "$Name.png"
$fileUrl = ([Uri]$htmlPath).AbsoluteUri

# ── 定位 Edge ────────────────────────────────────────────────
$edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles       'Microsoft\Edge\Application\msedge.exe')
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $edge) { throw '未找到 Microsoft Edge（msedge.exe），无法渲染。' }

# 每次使用独立浏览器配置目录，避免与现有 Edge 或并行任务冲突
$tmpProfile = Join-Path $env:TEMP ("career-os-edge-" + [Guid]::NewGuid().ToString('N'))

# Start-Process 不会自动为含空格的参数加引号（本项目路径含空格），统一手动处理
function Quote-Arg([string]$a) { if ($a -match '\s') { "`"$a`"" } else { $a } }

$baseArgs = @(
    # 注意：本机 Edge 用 --headless=new 会静默失败（exit 0 但不产出文件），必须用 --headless
    '--headless', '--disable-gpu', '--hide-scrollbars',
    (Quote-Arg "--user-data-dir=$tmpProfile"),
    '--no-first-run', '--no-default-browser-check'
)

function Invoke-ResumeRenderer([string[]]$Arguments, [string]$ExpectedFile) {
    $process = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList ($baseArgs + $Arguments)
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $lastSize = -1L
    $stableChecks = 0

    while (-not $process.HasExited) {
        if (Test-Path -LiteralPath $ExpectedFile) {
            $size = (Get-Item -LiteralPath $ExpectedFile).Length
            if ($size -gt 0 -and $size -eq $lastSize) { $stableChecks++ } else { $stableChecks = 0 }
            $lastSize = $size
            if ($stableChecks -ge 5) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                return
            }
        }
        if ([DateTime]::UtcNow -ge $deadline) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            if ((Test-Path -LiteralPath $ExpectedFile) -and (Get-Item -LiteralPath $ExpectedFile).Length -gt 0) { return }
            throw "浏览器渲染超时，且未生成有效文件: $ExpectedFile"
        }
        Start-Sleep -Milliseconds 200
    }

    if (-not (Test-Path -LiteralPath $ExpectedFile)) { throw "浏览器渲染失败: $ExpectedFile" }
}

# ── 渲染 PDF ────────────────────────────────────────────────
foreach ($f in @($pdfPath, $pngPath)) {
    if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
}
Invoke-ResumeRenderer -ExpectedFile $pdfPath -Arguments @(
    '--no-pdf-header-footer', (Quote-Arg "--print-to-pdf=$pdfPath"), (Quote-Arg $fileUrl)
)
if (-not (Test-Path -LiteralPath $pdfPath)) { throw 'PDF 渲染失败（未生成文件）。' }

# ── 校验页数（一页纸硬约束） ─────────────────────────────────
$raw = [Text.Encoding]::GetEncoding('ISO-8859-1').GetString([IO.File]::ReadAllBytes($pdfPath))
$pages = [regex]::Matches($raw, '/Type\s*/Page(?![a-zA-Z])').Count
if ($pages -le 0) {
    $counts = [regex]::Matches($raw, '/Count\s+(\d+)') | ForEach-Object { [int]$_.Groups[1].Value }
    if ($counts) { $pages = ($counts | Measure-Object -Maximum).Maximum }
}

if ($pages -lt 1) {
    throw '无法确认 PDF 页数；一页校验未通过。'
} elseif ($pages -gt $MaxPages) {
    Write-Error "内容超出 $MaxPages 页（实际 $pages 页）！删减内容后重新渲染。" -ErrorAction Continue
    exit 1
}

# ── 从已校验 PDF 栅格化 PNG，避免屏幕截图与打印版式漂移 ──────
$pdfToPpm = $env:CAREER_OS_PDFTOPPM
if (-not $pdfToPpm) {
    $command = Get-Command 'pdftoppm' -ErrorAction SilentlyContinue
    if ($command) { $pdfToPpm = $command.Source }
}
if ($pdfToPpm) {
    & $pdfToPpm -png -r 200 -f 1 -singlefile $pdfPath (Join-Path $OutDir $Name) | Out-Null
} else {
    $magick = Get-Command 'magick' -ErrorAction SilentlyContinue
    if (-not $magick) { throw '缺少 pdftoppm 或 ImageMagick，无法从最终 PDF 生成同版 PNG。' }
    & $magick.Source -density 200 "$pdfPath[0]" $pngPath
}
if (-not (Test-Path -LiteralPath $pngPath)) { throw 'PNG 栅格化失败（未生成文件）。' }

Write-Host "PDF : $pdfPath"
Write-Host "PNG : $pngPath"
Write-Host "页数: $pages"
Write-Host "✓ PDF/PNG 一页纸校验通过（PNG 与 PDF 同源）" -ForegroundColor Green

Remove-Item -LiteralPath $tmpProfile -Recurse -Force -ErrorAction SilentlyContinue
