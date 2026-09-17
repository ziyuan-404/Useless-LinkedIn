# 脱敏检查脚本 - PowerShell 版本
# 用途：在 push 到公开仓库前检查是否有敏感信息泄漏

param(
    [string]$Root = ".",
    [switch]$Verbose
)

$ErrorCount = 0
$WarningCount = 0

Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

Write-Host "=== Personal Career OS 脱敏检查 ===" -ForegroundColor Cyan
Write-Host ""

# 定义敏感信息模式
$Patterns = @{
    "手机号" = @{
        Regex = '\b1[3-9]\d{9}\b'
        Severity = "ERROR"
    }
    "邮箱" = @{
        Regex = '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        Severity = "WARNING"
        Exclude = @("example.com", "test.com", "demo.com", "placeholder")
    }
    "身份证" = @{
        Regex = '\b\d{17}[\dXx]\b'
        Severity = "ERROR"
    }
    "银行卡号" = @{
        Regex = '\b\d{16,19}\b'
        Severity = "WARNING"
    }
}

# 定义需要检查的目录和文件
$RootPath = (Resolve-Path -LiteralPath $Root).Path
$CheckPaths = @(
    (Join-Path $RootPath "profile"),
    (Join-Path $RootPath "template"),
    (Join-Path $RootPath "applications"),
    (Join-Path $RootPath "archive")
)

# 定义排除模式
$ExcludePatterns = @(
    "*.png",
    "*.jpg",
    "*.pdf",
    "tmp/*",
    ".git/*"
)

function Test-SensitiveContent {
    param(
        [string]$FilePath,
        [string]$Content
    )

    $FileHasIssues = $false

    foreach ($PatternName in $Patterns.Keys) {
        $Pattern = $Patterns[$PatternName]
        $Matches = [regex]::Matches($Content, $Pattern.Regex)

        if ($Matches.Count -gt 0) {
            # 检查排除列表
            $RealMatches = $Matches
            if ($Pattern.Exclude) {
                $RealMatches = $Matches | Where-Object {
                    $Match = $_
                    -not ($Pattern.Exclude | Where-Object { $Match.Value -like "*$_*" })
                }
            }

            if ($RealMatches.Count -gt 0) {
                $FileHasIssues = $true

                if ($Pattern.Severity -eq "ERROR") {
                    Write-Host "  [错误] 发现 $PatternName" -ForegroundColor Red
                    $script:ErrorCount++
                } else {
                    Write-Host "  [警告] 疑似 $PatternName" -ForegroundColor Yellow
                    $script:WarningCount++
                }

                if ($Verbose) {
                    foreach ($Match in $RealMatches) {
                        $LineNum = ($Content.Substring(0, $Match.Index) -split "`n").Count
                        $Preview = $Match.Value.Substring(0, [Math]::Min(20, $Match.Value.Length))
                        if ($Match.Value.Length -gt 20) { $Preview += "..." }
                        Write-Host "    第 $LineNum 行: $Preview" -ForegroundColor Gray
                    }
                }
            }
        }
    }

    return $FileHasIssues
}

function Get-DocxText {
    param([string]$FilePath)

    $Archive = [IO.Compression.ZipFile]::OpenRead($FilePath)
    try {
        $Parts = @("word/document.xml", "word/comments.xml", "docProps/core.xml")
        $Chunks = @()
        foreach ($Part in $Parts) {
            $Entry = $Archive.GetEntry($Part)
            if (-not $Entry) { continue }
            $Reader = [IO.StreamReader]::new($Entry.Open())
            try { $Chunks += $Reader.ReadToEnd() } finally { $Reader.Dispose() }
        }
        $XmlText = $Chunks -join " "
        $PlainText = [regex]::Replace($XmlText, '<[^>]+>', ' ')
        return [Net.WebUtility]::HtmlDecode($PlainText)
    } finally {
        $Archive.Dispose()
    }
}

# 检查特定占位符是否被替换
function Test-PlaceholderReplaced {
    param(
        [string]$FilePath,
        [string]$Content
    )

    $Placeholders = @("【待填】", "张三", "zhangsan@example.com", "138-0000-0000")
    $IsTemplate = $false

    foreach ($Placeholder in $Placeholders) {
        if ($Content -like "*$Placeholder*") {
            $IsTemplate = $true
            break
        }
    }

    return $IsTemplate
}

# 遍历检查
Write-Host "检查中..." -ForegroundColor Cyan
Write-Host "工作区: $RootPath" -ForegroundColor Gray
$FilesChecked = 0
$TemplateFiles = @()
$IssueFiles = @()

foreach ($Path in $CheckPaths) {
    if (Test-Path $Path) {
        $Files = Get-ChildItem -Path $Path -Recurse -File -Exclude $ExcludePatterns -ErrorAction SilentlyContinue

        foreach ($File in $Files) {
            $FilesChecked++
            if ($File.Extension -ieq ".docx") {
                $Content = Get-DocxText -FilePath $File.FullName
            } else {
                $Content = Get-Content $File.FullName -Raw -ErrorAction SilentlyContinue
            }

            if (-not $Content) { continue }

            $RelPath = [IO.Path]::GetRelativePath($RootPath, $File.FullName)

            # 检查是否仍是模板状态
            $IsTemplate = Test-PlaceholderReplaced -FilePath $RelPath -Content $Content
            if ($IsTemplate) {
                $TemplateFiles += $RelPath
            }

            # 检查敏感信息
            $HasIssues = Test-SensitiveContent -FilePath $RelPath -Content $Content
            if ($HasIssues) {
                $IssueFiles += $RelPath
                Write-Host ""
            }
        }
    }
}

Write-Host ""
Write-Host "=== 检查结果 ===" -ForegroundColor Cyan
Write-Host "已检查文件: $FilesChecked 个"
Write-Host ""

if ($TemplateFiles.Count -gt 0) {
    Write-Host "[通过] 以下文件仍是模板状态（包含占位符）:" -ForegroundColor Green
    $TemplateFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    Write-Host ""
}

if ($ErrorCount -gt 0) {
    Write-Host "[失败] 发现 $ErrorCount 个错误，$WarningCount 个警告" -ForegroundColor Red
    Write-Host "请检查以上文件，移除敏感信息后重新运行。" -ForegroundColor Red
    exit 1
} elseif ($WarningCount -gt 0) {
    Write-Host "[警告] 发现 $WarningCount 个警告" -ForegroundColor Yellow
    Write-Host "请确认以上内容是否为真实敏感信息。" -ForegroundColor Yellow
    Write-Host "如果确认无误，可以继续。" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "[通过] 未发现敏感信息" -ForegroundColor Green
    exit 0
}
