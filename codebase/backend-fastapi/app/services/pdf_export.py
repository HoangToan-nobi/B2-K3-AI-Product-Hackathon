from html import escape
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.flowables import HRFlowable


FONT_NAME = "VLuoiSerif"
FONT_BOLD = "VLuoiSerif-Bold"
FONT_ITALIC = "VLuoiSerif-Italic"


def _font_families() -> list[dict[str, Path]]:
    return [
        {
            "regular": Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
            "bold": Path("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"),
            "italic": Path("/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf"),
        },
        {
            "regular": Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
            "bold": Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
            "italic": Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"),
        },
        {
            "regular": Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"),
            "bold": Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf"),
            "italic": Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf"),
        },
    ]


def _register_serif_font() -> tuple[str, str, str]:
    if FONT_NAME in pdfmetrics.getRegisteredFontNames():
        return FONT_NAME, FONT_BOLD, FONT_ITALIC
    for family in _font_families():
        if all(path.exists() for path in family.values()):
            pdfmetrics.registerFont(TTFont(FONT_NAME, str(family["regular"])))
            pdfmetrics.registerFont(TTFont(FONT_BOLD, str(family["bold"])))
            pdfmetrics.registerFont(TTFont(FONT_ITALIC, str(family["italic"])))
            pdfmetrics.registerFontFamily(
                FONT_NAME,
                normal=FONT_NAME,
                bold=FONT_BOLD,
                italic=FONT_ITALIC,
                boldItalic=FONT_BOLD,
            )
            return FONT_NAME, FONT_BOLD, FONT_ITALIC
    return "Times-Roman", "Times-Bold", "Times-Italic"


def _p(text: Any) -> str:
    return escape(str(text or "")).replace("\n", "<br/>")


def _pages(item: dict[str, Any]) -> str:
    pages = item.get("source_pages") or []
    return ", ".join(str(page) for page in pages) if pages else "chưa rõ"


def _styles(font_name: str, bold_name: str, italic_name: str) -> dict[str, ParagraphStyle]:
    return {
        "brand": ParagraphStyle(
            "VLuoiBrand",
            fontName=font_name,
            fontSize=11,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#555555"),
            uppercase=True,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "VLuoiTitle",
            fontName=bold_name,
            fontSize=19,
            leading=24,
            alignment=1,
            textColor=colors.HexColor("#1A1A1A"),
            spaceBefore=4,
            spaceAfter=6,
        ),
        "meta": ParagraphStyle(
            "VLuoiMeta",
            fontName=font_name,
            fontSize=10.5,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#555555"),
            spaceAfter=14,
        ),
        "heading": ParagraphStyle(
            "VLuoiHeading",
            fontName=bold_name,
            fontSize=13.5,
            leading=18,
            textTransform="uppercase",
            textColor=colors.HexColor("#1A1A1A"),
            spaceBefore=18,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "VLuoiBody",
            fontName=font_name,
            fontSize=12.5,
            leading=19.4,
            textColor=colors.HexColor("#1A1A1A"),
            spaceAfter=6,
        ),
        "body_bold": ParagraphStyle(
            "VLuoiBodyBold",
            fontName=bold_name,
            fontSize=12.5,
            leading=19.4,
            textColor=colors.HexColor("#1A1A1A"),
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "VLuoiSmall",
            fontName=font_name,
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#555555"),
            spaceAfter=5,
        ),
        "page_ref": ParagraphStyle(
            "VLuoiPageRef",
            fontName=italic_name,
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#666666"),
        ),
        "faq_source": ParagraphStyle(
            "VLuoiFaqSource",
            fontName=italic_name,
            fontSize=10,
            leading=13,
            alignment=2,
            textColor=colors.HexColor("#666666"),
            spaceBefore=3,
        ),
        "quiz_answer": ParagraphStyle(
            "VLuoiQuizAnswer",
            fontName=font_name,
            fontSize=11.5,
            leading=16,
            textColor=colors.HexColor("#1A1A1A"),
        ),
    }


def _section(story: list[Any], styles: dict[str, ParagraphStyle], title: str) -> None:
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph(_p(title), styles["heading"]))
    story.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#999999"), spaceAfter=10))


def _bullet_list(items: list[Paragraph], font_name: str) -> ListFlowable:
    return ListFlowable(
        [ListItem(item, leftIndent=13, spaceAfter=8) for item in items],
        bulletType="bullet",
        start="bulletchar",
        bulletFontName=font_name,
        bulletFontSize=12,
        leftIndent=13,
        bulletOffsetY=1,
    )


def _option_prefix(index: int) -> str:
    return chr(65 + index)


def _header(story: list[Any], pack: dict[str, Any], styles: dict[str, ParagraphStyle]) -> None:
    analysis = pack.get("analysis", {})
    lesson = pack.get("lesson", {})
    story.extend(
        [
            Paragraph("VLười — Gói ôn tập", styles["brand"]),
            Paragraph(_p(lesson.get("title", "")), styles["title"]),
            Paragraph(
                _p(
                    f"{lesson.get('slide_count', 0)} slides | "
                    f"{analysis.get('unique_user_count', 0)} học viên hỏi | "
                    f"{analysis.get('cluster_count', 0)} chủ đề"
                ),
                styles["meta"],
            ),
            HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#333333"), spaceAfter=17),
        ]
    )


def _faq_box(item: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    rows = [
        Paragraph(_p(item.get("topic")), styles["body_bold"]),
        Paragraph(f"<b>Câu hỏi học viên thường hỏi:</b> {_p(item.get('common_confusion'))}", styles["body"]),
        Paragraph(f"<b>Trả lời & giải thích:</b> {_p(item.get('correct_understanding'))}", styles["body"]),
        Paragraph(
            _p(f"{item.get('unique_user_count', 0)} học viên, trang {_pages(item)}"),
            styles["faq_source"],
        ),
    ]
    table = Table([[rows]], colWidths=[None], style=TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#CCCCCC")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _quiz_answer_box(item: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    correct_option = item.get("correct_option")
    answer_prefix = ""
    if isinstance(correct_option, int) and 0 <= correct_option < 26:
        answer_prefix = f"{_option_prefix(correct_option)}."
    answer = _p(item.get("answer"))
    explanation = _p(item.get("explanation"))
    answer_detail = f"{answer} " if answer and not answer.lstrip().startswith(answer_prefix) else ""
    paragraph = Paragraph(
        f"<b>Đáp án: {_p(answer_prefix or answer)} </b>{answer_detail}{explanation} "
        f"<font name='{styles['page_ref'].fontName}' color='#666666'>[trang {_p(_pages(item))}]</font>",
        styles["quiz_answer"],
    )
    return Table([[paragraph]], colWidths=[None], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F2F2")),
        ("LINEBEFORE", (0, 0), (-1, -1), 2.25, colors.HexColor("#333333")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))


def generate_review_pack_pdf(pack: dict[str, Any]) -> bytes:
    font_name, bold_name, italic_name = _register_serif_font()
    styles = _styles(font_name, bold_name, italic_name)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.2 * cm,
    )

    lesson = pack.get("lesson", {})
    story: list[Any] = []
    _header(story, pack, styles)

    _section(story, styles, "1. Lý thuyết trọng tâm")
    summary_items = []
    for item in pack.get("summary", []):
        summary_items.append(
            Paragraph(
                f"<b>{_p(item.get('title'))}</b><br/>"
                f"{_p(item.get('content'))} "
                f"<font name='{italic_name}' color='#666666' size='10.5'>[trang {_p(_pages(item))}]</font>",
                styles["body"],
            )
        )
    if summary_items:
        story.append(_bullet_list(summary_items, font_name))

    _section(story, styles, "2. Cả lớp thường hỏi")
    for item in [it for it in pack.get("class_insights", []) if it.get("status") == "ready"]:
        story.append(_faq_box(item, styles))
        story.append(Spacer(1, 0.18 * cm))

    flagged = any(it.get("status") == "needs_review" for it in pack.get("class_insights", [])) or any(
        it.get("status") == "needs_review" for it in pack.get("review_questions", [])
    )
    if flagged:
        story.append(
            Paragraph(
                "Lưu ý: một số nội dung đang chờ Lab Coach duyệt và không được đưa vào bản phát hành.",
                styles["page_ref"],
            )
        )

    _section(story, styles, "3. Quiz nhanh")
    for index, item in enumerate(pack.get("review_questions", []), start=1):
        if item.get("status") != "ready":
            continue
        story.append(Paragraph(f"<b>{index}. {_p(item.get('question'))}</b>", styles["body"]))
        options = item.get("options") if isinstance(item.get("options"), list) else []
        if options:
            option_lines = [
                Paragraph(f"{_option_prefix(idx)}. {_p(option)}", styles["body"])
                for idx, option in enumerate(options[:4])
            ]
            story.extend(option_lines)
        story.append(_quiz_answer_box(item, styles))
        story.append(Spacer(1, 0.22 * cm))

    story.extend(
        [
            Spacer(1, 0.5 * cm),
            HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#999999"), spaceBefore=6, spaceAfter=8),
            Paragraph(_p(f"VLười — Gói ôn tập | {lesson.get('title', '')}"), styles["faq_source"]),
        ]
    )

    doc.build(story)
    return buffer.getvalue()
