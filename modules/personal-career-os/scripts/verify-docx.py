#!/usr/bin/env python3
"""Render a DOCX for visual QA and enforce exactly one A4 page.

Usage:
    python verify-docx.py resume.docx --output-dir tmp/docx-qa
"""

from __future__ import annotations

import argparse
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def find_tool(env_name: str, names: tuple[str, ...], extra_paths: tuple[str, ...] = ()) -> str:
    configured = os.environ.get(env_name, "").strip()
    if configured:
        path = Path(configured).expanduser()
        if path.is_file():
            return str(path.resolve())
        raise FileNotFoundError(f"{env_name} 指向的文件不存在: {path}")
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for raw in extra_paths:
        path = Path(raw)
        if path.is_file():
            return str(path)
    raise FileNotFoundError(f"未找到工具: {', '.join(names)}")


def run(command: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, env=env, check=False)
    if result.returncode != 0:
        details = (result.stdout + "\n" + result.stderr).strip()
        raise RuntimeError(f"命令失败（{result.returncode}）: {' '.join(command)}\n{details}")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="渲染 DOCX 并强制校验一页 A4。")
    parser.add_argument("docx", type=Path, help="待校验的 .docx")
    parser.add_argument("--output-dir", type=Path, required=True, help="输出内部 QA 图片的目录")
    parser.add_argument("--emit-pdf", action="store_true", help="同时保留 DOCX 渲染出的 QA PDF")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    docx = args.docx.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not docx.is_file() or docx.suffix.lower() != ".docx":
        print(f"错误: DOCX 不存在或扩展名不正确: {docx}", file=sys.stderr)
        return 2

    try:
        soffice = find_tool(
            "CAREER_OS_SOFFICE",
            ("soffice", "libreoffice"),
            (
                "/Applications/LibreOffice.app/Contents/MacOS/soffice",
                "/Applications/LibreOfficeDev.app/Contents/MacOS/soffice",
            ),
        )
        pdfinfo = find_tool("CAREER_OS_PDFINFO", ("pdfinfo",))
        pdftoppm = find_tool("CAREER_OS_PDFTOPPM", ("pdftoppm",))
    except FileNotFoundError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("page-*.png"):
        stale.unlink()

    env = os.environ.copy()
    config = Path(__file__).with_name("fontconfig-macos.conf")
    if platform.system() == "Darwin" and "FONTCONFIG_FILE" not in env and config.is_file():
        env["FONTCONFIG_FILE"] = str(config.resolve())

    try:
        with tempfile.TemporaryDirectory(prefix="career-os-docx-") as temporary:
            temp = Path(temporary)
            profile = temp / "lo-profile"
            converted = temp / "converted"
            profile.mkdir()
            converted.mkdir()
            env["HOME"] = str(profile)
            env["XDG_CONFIG_HOME"] = str(profile / "xdg-config")
            env["XDG_CACHE_HOME"] = str(profile / "xdg-cache")

            run(
                [
                    soffice,
                    f"-env:UserInstallation={profile.as_uri()}",
                    "--invisible",
                    "--headless",
                    "--norestore",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(converted),
                    str(docx),
                ],
                env,
            )
            pdf = converted / f"{docx.stem}.pdf"
            if not pdf.is_file() or pdf.stat().st_size == 0:
                candidates = sorted(converted.glob("*.pdf"))
                if not candidates:
                    raise RuntimeError("LibreOffice 未生成 PDF。")
                pdf = candidates[0]

            info = run([pdfinfo, str(pdf)], env).stdout
            match = re.search(r"^Pages:\s+(\d+)\s*$", info, flags=re.MULTILINE)
            if not match:
                raise RuntimeError("无法读取 DOCX 渲染后的页数。")
            pages = int(match.group(1))
            if pages != 1:
                raise RuntimeError(f"DOCX 必须恰好一页，实际为 {pages} 页。")

            prefix = output_dir / "page-1"
            run(
                [pdftoppm, "-png", "-r", "170", "-f", "1", "-singlefile", str(pdf), str(prefix)],
                env,
            )
            image = output_dir / "page-1.png"
            if not image.is_file() or image.stat().st_size == 0:
                raise RuntimeError("DOCX QA 图片生成失败。")
            if args.emit_pdf:
                shutil.copy2(pdf, output_dir / f"{docx.stem}.qa.pdf")
    except (OSError, RuntimeError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 3

    print(f"DOCX: {docx}")
    print("页数: 1")
    print(f"QA 图片: {output_dir / 'page-1.png'}")
    print("✓ DOCX 一页硬校验通过；交付前仍须目视检查该图片。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
