#!/usr/bin/env python3
"""Normalize an approved resume image for the resume header.

This script never downloads or invents an image. It only converts a local file
that the user has supplied or explicitly approved.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageOps
except ImportError as exc:  # pragma: no cover - host runtime dependent
    raise SystemExit(
        "缺少 Pillow。请使用当前 Agent 自带的文档 Python 运行本脚本。"
    ) from exc

# Official print-ready TIFF assets can legitimately be very large. The script
# only accepts a user-supplied or explicitly approved local file, then reduces
# it before RGBA conversion to keep memory bounded.
Image.MAX_IMAGE_PIXELS = 300_000_000


PRESETS = {
    "portrait": {
        "pixels": (600, 810),
        "millimeters": (20, 27),
        "label": "证件照",
        "fixed_canvas": True,
    },
    "logo": {
        # Wide official lockups fill the width while square emblems are
        # limited by height, giving both a balanced visual weight.
        "pixels": (1200, 480),
        "millimeters": (40, 16),
        "label": "学校标识",
        "fixed_canvas": False,
    },
}

PORTRAIT_RATIO_RANGE = (0.67, 0.82)
PORTRAIT_FRAME_DENSITY = 0.68
PORTRAIT_FRAME_MIN_FRACTION = 0.005
PORTRAIT_FRAME_MAX_FRACTION = 0.16


def crop_empty_margins(image: Image.Image) -> Image.Image:
    """Trim transparent or near-white margins without touching visible marks."""
    alpha = image.getchannel("A")
    alpha_minimum, _ = alpha.getextrema()
    if alpha_minimum < 255:
        mask = alpha.copy()
    else:
        rgb = image.convert("RGB")
        difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, "white"))
        mask = difference.convert("L").point(lambda value: 255 if value > 8 else 0)

    # Official print assets sometimes contain a one-pixel gray crop frame.
    # Ignore a narrow outer band while detecting content; the padding added
    # below restores genuinely edge-touching artwork without retaining frames.
    edge_band = max(2, round(min(image.width, image.height) * 0.01))
    mask.paste(0, (0, 0, image.width, edge_band))
    mask.paste(0, (0, image.height - edge_band, image.width, image.height))
    mask.paste(0, (0, 0, edge_band, image.height))
    mask.paste(0, (image.width - edge_band, 0, image.width, image.height))
    bounds = mask.getbbox()

    if not bounds:
        return image

    left, top, right, bottom = bounds
    padding = max(2, round(max(right - left, bottom - top) * 0.015))
    return image.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        )
    )


def flatten_on_white(image: Image.Image) -> Image.Image:
    """Return an RGB preview with transparency composited onto white."""
    canvas = Image.new("RGBA", image.size, (255, 255, 255, 255))
    canvas.alpha_composite(image)
    return canvas.convert("RGB")


def nonwhite_mask(image: Image.Image, threshold: int = 12) -> Image.Image:
    """Mark pixels whose strongest RGB difference from white exceeds threshold."""
    rgb = flatten_on_white(image)
    difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, "white"))
    red, green, blue = difference.split()
    strongest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    return strongest.point(lambda value: 255 if value > threshold else 0)


def dense_bounds(mask: Image.Image) -> tuple[int, int, int, int] | None:
    """Find a rectangular photo boundary backed by dense non-white rows/columns."""
    width, height = mask.size
    pixels = mask.load()
    row_density = [sum(1 for x in range(width) if pixels[x, y]) / width for y in range(height)]
    column_density = [sum(1 for y in range(height) if pixels[x, y]) / height for x in range(width)]

    dense_rows = [index for index, value in enumerate(row_density) if value >= PORTRAIT_FRAME_DENSITY]
    dense_columns = [index for index, value in enumerate(column_density) if value >= PORTRAIT_FRAME_DENSITY]
    if not dense_rows or not dense_columns:
        return None
    return dense_columns[0], dense_rows[0], dense_columns[-1] + 1, dense_rows[-1] + 1


def trim_obvious_portrait_frame(image: Image.Image) -> tuple[Image.Image, bool]:
    """Remove only an obvious four-sided outer frame, never ordinary photo background.

    A white-background portrait cannot be safely auto-trimmed by content bounds because
    that can crop into the head or shoulders. We therefore require a narrow outer band
    on all four sides followed by rows and columns that are mostly non-white, which is
    characteristic of a screenshot/scanner frame around a colored photo background.
    """
    preview = image.copy()
    preview.thumbnail((400, 400), Image.Resampling.LANCZOS)
    bounds = dense_bounds(nonwhite_mask(preview))
    if bounds is None:
        return image, False

    left, top, right, bottom = bounds
    preview_width, preview_height = preview.size
    borders = {
        "left": left / preview_width,
        "right": (preview_width - right) / preview_width,
        "top": top / preview_height,
        "bottom": (preview_height - bottom) / preview_height,
    }
    if not all(
        PORTRAIT_FRAME_MIN_FRACTION <= fraction <= PORTRAIT_FRAME_MAX_FRACTION
        for fraction in borders.values()
    ):
        return image, False

    scale_x = image.width / preview_width
    scale_y = image.height / preview_height
    padding_x = max(1, round(image.width * 0.003))
    padding_y = max(1, round(image.height * 0.003))
    crop_box = (
        max(0, round(left * scale_x) - padding_x),
        max(0, round(top * scale_y) - padding_y),
        min(image.width, round(right * scale_x) + padding_x),
        min(image.height, round(bottom * scale_y) + padding_y),
    )
    cropped = image.crop(crop_box)
    if cropped.width <= 0 or cropped.height <= 0:
        return image, False
    return cropped, True


def normalize(source: Path, output: Path, kind: str) -> tuple[int, int, float, float, bool]:
    preset = PRESETS[kind]
    target_width, target_height = preset["pixels"]
    with Image.open(source) as opened:
        reduction = max(
            1,
            min(
                max(1, opened.width // (target_width * 4)),
                max(1, opened.height // (target_height * 4)),
            ),
        )
        reduced = opened.reduce(reduction) if reduction > 1 else opened.copy()
        image = ImageOps.exif_transpose(reduced).convert("RGBA")
        if image.width <= 0 or image.height <= 0:
            raise ValueError("图片尺寸无效。")
        source_ratio = image.width / image.height
        portrait_frame_trimmed = False
        if kind == "portrait":
            image, portrait_frame_trimmed = trim_obvious_portrait_frame(image)
        elif not preset["fixed_canvas"]:
            if image.width > 8 and image.height > 8:
                image = image.crop((2, 2, image.width - 2, image.height - 2))
            image = crop_empty_margins(image)
        normalized_source_ratio = image.width / image.height
        contained = ImageOps.contain(
            image,
            (target_width, target_height),
            method=Image.Resampling.LANCZOS,
        )
        if preset["fixed_canvas"]:
            canvas = Image.new("RGBA", (target_width, target_height), (255, 255, 255, 255))
            left = (target_width - contained.width) // 2
            top = (target_height - contained.height) // 2
            canvas.alpha_composite(contained, (left, top))
        else:
            canvas = Image.new("RGBA", contained.size, (255, 255, 255, 255))
            canvas.alpha_composite(contained)
        output.parent.mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(output, format="PNG", dpi=(300, 300), optimize=True)
    return canvas.width, canvas.height, source_ratio, normalized_source_ratio, portrait_frame_trimmed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="把已确认的学校标识或证件照转换为简历页眉图片。")
    parser.add_argument("kind", choices=sorted(PRESETS), help="portrait=证件照；logo=学校标识（可含校徽+校名）")
    parser.add_argument("input", type=Path, help="用户提供或确认使用的本地图片")
    parser.add_argument("output", type=Path, help="输出 PNG")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        print(f"错误: 输入图片不存在: {source}", file=sys.stderr)
        return 2
    if source == output:
        print("错误: 标准化图片必须另存，不能覆盖用户提供的原图。", file=sys.stderr)
        return 2
    if output.suffix.lower() != ".png":
        print("错误: 标准化图片必须输出为 .png。", file=sys.stderr)
        return 2
    try:
        width, height, source_ratio, normalized_source_ratio, portrait_frame_trimmed = normalize(
            source, output, args.kind
        )
    except (OSError, ValueError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 3
    preset = PRESETS[args.kind]
    mm_width, mm_height = preset["millimeters"]
    print(f"{preset['label']}: {output}")
    if preset["fixed_canvas"]:
        print(f"画布: {width} x {height} px；文档尺寸: {mm_width} x {mm_height} mm")
        if portrait_frame_trimmed:
            print("预处理: 已移除四边清晰的外框留白；未裁切人物主体。")
        else:
            print("预处理: 未发现可安全自动移除的四边外框；保留原始构图。")
        minimum_ratio, maximum_ratio = PORTRAIT_RATIO_RANGE
        if not minimum_ratio <= normalized_source_ratio <= maximum_ratio:
            print(
                f"提醒: 证件照有效画面比例为 {normalized_source_ratio:.3f}，"
                f"超出常见竖版范围 {minimum_ratio:.2f}-{maximum_ratio:.2f}；"
                "请查看标准化图片与最终 A4，确认人物没有明显偏小。",
                file=sys.stderr,
            )
        elif abs(source_ratio - normalized_source_ratio) > 0.01:
            print(
                f"有效画面比例: {source_ratio:.3f} -> {normalized_source_ratio:.3f}（移除外框后）"
            )
    else:
        print(f"图片: {width} x {height} px；文档最大边界: {mm_width} x {mm_height} mm（等比缩放）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
