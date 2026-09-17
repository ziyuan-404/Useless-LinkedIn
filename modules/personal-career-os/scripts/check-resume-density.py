#!/usr/bin/env python3
"""Measure bottom whitespace in a rendered one-page A4 resume PNG."""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - host runtime dependent
    raise SystemExit("缺少 Pillow。请使用当前 Agent 自带的文档 Python 运行本脚本。") from exc


A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297


def measure_bottom_whitespace(path: Path) -> float:
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("图片尺寸无效。")

    # Ignore the outer page margins and one-pixel specks. A row counts as
    # content only when it contains enough genuinely dark pixels.
    left = round(width * 7.5 / A4_WIDTH_MM)
    right = round(width * (A4_WIDTH_MM - 7.5) / A4_WIDTH_MM)
    row_width = right - left
    minimum_dark_pixels = max(12, round(row_width * 0.002))
    last_content_row = -1

    for y in range(height):
        row = image.crop((left, y, right, y + 1))
        pixels = (
            row.get_flattened_data()
            if hasattr(row, "get_flattened_data")
            else row.getdata()
        )
        dark_pixels = sum(1 for red, green, blue in pixels if min(red, green, blue) < 235)
        if dark_pixels >= minimum_dark_pixels:
            last_content_row = y

    if last_content_row < 0:
        raise ValueError("未在页面中识别到正文内容。")
    return (height - 1 - last_content_row) * A4_HEIGHT_MM / height


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查一页 A4 简历底部留白是否协调。")
    parser.add_argument("png", type=Path, help="由最终 PDF 或 DOCX 渲染得到的整页 PNG")
    parser.add_argument("--minimum-mm", type=float, default=10, help="建议最小底部留白，默认 10 mm")
    parser.add_argument("--maximum-mm", type=float, default=20, help="建议最大底部留白，默认 20 mm")
    parser.add_argument("--strict", action="store_true", help="超出建议范围时返回非零状态")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.png.is_file():
        raise FileNotFoundError(f"找不到 PNG: {args.png}")
    if args.minimum_mm < 0 or args.maximum_mm <= args.minimum_mm:
        raise ValueError("留白范围参数无效。")

    whitespace = measure_bottom_whitespace(args.png)
    print(f"底部留白: {whitespace:.1f} mm")
    if whitespace < args.minimum_mm:
        print("提示: 页面偏满；优先删减弱相关内容或收紧局部间距，避免贴底。")
        return 1 if args.strict else 0
    if whitespace > args.maximum_mm:
        print("提示: 页面留白偏多；优先补充与 JD 强相关的已确认事实，禁止编造或注水。")
        return 1 if args.strict else 0
    print("✓ 页面纵向密度处于建议范围")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
