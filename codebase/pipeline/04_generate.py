#!/usr/bin/env python3
"""Loi goi AI that #2: sinh noi dung on tap (tom tat, insight, cau hoi) tu slide + cluster.

Dung: python3 04_generate.py <slide.json> <clusters.json> <questions.json> <lesson_title> <output.json>

Sau khi AI tra ve, script tu ap "grounding gate" rule-based (khong tin tuong tuyet doi AI):
  - unique_user_count tinh lai tu du lieu that (turn_id -> user_id), khong lay so AI tu bao.
  - status = "ready" chi khi source_excerpt thuc su xuat hien (gan dung, sau khi chuan hoa \
    khoang trang) trong noi dung cac source_pages duoc khai; nguoc lai -> "needs_review".
"""
import json
import re
import sys

from common import call_ai_json

SYSTEM_PROMPT = """Ban la bo phan sinh noi dung on tap trong pipeline VLười. Dau vao la text \
tung trang slide (nguon su that duy nhat ve kien thuc) va cac cluster cau hoi hoc vien da gom \
theo chu de (chi la TIN HIEU cho biet hoc vien hay vuong o dau, KHONG duoc coi la nguon kien \
thuc dung).

Nguyen tac bat buoc:
1. Moi claim kien thuc phai trich duoc tu chinh text slide da cung cap — khong bia them kien \
   thuc ngoai slide, du dung that ve mat khoa hoc.
2. Voi moi claim, dua "source_excerpt": mot cum tu hoac cau NGUYEN VAN lay tu dung text slide \
   da cho (khong dien giai lai) o dung source_pages, de he thong kiem tra doi chieu duoc.
3. Neu mot cluster la logistics (deadline, tien do khoa hoc...) hoac khong phai kien thuc hoc \
   thuat, dua vao "skipped_clusters" kem ly do, KHONG sinh insight cho no.
4. Neu khong tim thay cho nao trong slide giai thich duoc dung y hoi cua cluster, van sinh insight \
   nhung tu danh gia "confidence" thap (<0.5) va ghi "source_excerpt" la doan gan nhat tim duoc.
   Neu source_pages hoc vien tham chieu KHONG khop noi dung thuc su lien quan (vi du hoi ve chu \
   de X nhung trang do khong noi ve X, trong khi X nam o trang khac) — PHAI sua source_pages ve \
   dung trang chua noi dung, VA bat buoc dat confidence duoi 0.6 (khong duoc cho ready) vi hoc \
   vien co the da nham trang, can Lab Coach xac nhan lai.
4b. QUAN TRONG: neu MOT cluster gom nhieu cau hoi hoi ve NHIEU KHAI NIEM KHAC NHAU (vi du 1 cau \
    hoi ve "perceptron", 1 cau khac hoi ve "ML vs DL" — du ca hai deu la "chua ro khai niem nen \
    tang"), TUYET DOI KHONG duoc tron cau tra loi cua khai niem CO trong slide voi dinh nghia tu \
    nghi ra cho khai niem KHONG co trong slide, du dinh nghia do dung ve mat kien thuc thuc te. \
    Voi tung khai niem trong cluster: neu co trong slide thi tra loi kem source_excerpt cua \
    dung khai niem do; neu khong co thi correct_understanding phai noi ro "slide khong de cap \
    <ten khai niem>" cho DUNG khai niem do, khong duoc lang le bo qua roi chi tra loi phan de.
5. Cau hoi tu kiem tra (review_questions) phai co dap an suy ra truc tiep tu source_excerpt.
6. Sinh DUNG 5 review_questions theo thu tu bat buoc sau, khong duoc doi thu tu hay bo qua:
   - 1 cau tu summary item dau tien (summary[0])
   - 1 cau tu summary item ve chu de "vi sao model co the tra loi sai / hallucination / gioi han" \
     (xem quy tac ve summary ben duoi) — day la kien thuc quan trong nhat de hoc vien biet khi nao \
     KHONG nen tin tuyet doi AI
   - 1 cau tu 1 summary item khac (bat ky, khac 2 cau tren)
   - 1 cau kiem tra MOT KY HIEU/THAM SO KY THUAT CU THE xuat hien nguyen van tren slide (vi du: \
     "T=0", "top_p", so token cua context window...) — cau hoi, dap an, explanation PHAI giu dung \
     ky hieu do, khong duoc dien giai thanh van xuoi lam mat ky hieu
   - 1 cau tu cluster co unique_user_count cao nhat con lai chua dung (neu khong con cluster nao \
     thi lay tu 1 summary item con lai)

Tra ve DUY NHAT JSON object dung schema:
{
  "summary": [
    {"id": "summary-01", "title": "...", "content": "...", "source_pages": [int], \
"source_excerpt": "...", "confidence": 0.0-1.0}
  ],
  "class_insights": [
    {"id": "insight-<cluster_id>", "topic": "...", "common_confusion": "...", \
"correct_understanding": "...", "source_pages": [int], "source_excerpt": "...", \
"confidence": 0.0-1.0}
  ],
  "review_questions": [
    {"id": "question-01", "type": "multiple_choice", "question": "...", \
"options": ["4 lua chon"], "correct_option": 0-3, "answer": "...", "explanation": "...", \
"source_pages": [int], "source_excerpt": "...", "confidence": 0.0-1.0}
  ],
  "skipped_clusters": [{"cluster_id": "...", "reason": "..."}]
}

summary lay 6-7 y quan trong nhat cua CA BUOI HOC truc tiep tu slide (khong phu thuoc cluster nao \
co hay khong, de tranh bo sot kien thuc ma khong ai hoi - "silent confusion"). Bat buoc:
- Moi item lay tu MOT KHOANG TRANG KHAC NHAU, trai deu tu dau den cuoi slide — khong duoc de 2 \
  item trung lap y hoac lay chung 1 khoang trang hep nhu nhau.
- Trong so 6-7 item, BAT BUOC co: (a) 1 item ve quan he LLM/chatbot (chatbot la san pham dong \
  goi ben ngoai, LLM la bo nao nen ben trong); (b) 1 item ve VI SAO MODEL CO THE TRA LOI SAI \
  (hallucination, model toi uu cho cau nghe hop ly khong phai tra su that, knowledge cutoff, \
  gioi han context) — day la phan slide noi truc tiep ve do tin cay cua AI, KHONG duoc bo qua \
  du chatlog co ai hoi ve no hay khong; (c) it nhat 1 item ve phan dau slide (lich su AI / cac \
  moc phat trien) va it nhat 1 item ve phan cuoi slide (vd agent, chi phi, cau truc prompt, \
  temperature/top_p) — de dam bao phu ca slide, khong don vao giua."""


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def build_user_prompt(slide: dict, clusters: dict, lesson_title: str) -> str:
    slide_pages_text = [{"page": p["page"], "text": p["text"]} for p in slide["pages"]]
    payload = {
        "lesson_title": lesson_title,
        "slide_pages": slide_pages_text,
        "question_clusters": clusters.get("clusters", []),
    }
    return (
        "Du lieu dau vao (JSON). Sinh noi dung on tap dung schema va nguyen tac da neu:\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def compute_unique_user_counts(questions: list) -> dict:
    """turn_id -> user_id, roi tra ve ham tra cuu cluster turn_ids -> so user duy nhat + so luot."""
    turn_to_user = {q["turn_id"]: q["user_id"] for q in questions}
    return turn_to_user


_STOPWORDS = {
    "là", "và", "của", "các", "một", "để", "trong", "khi", "có", "không", "này",
    "cho", "được", "với", "như", "từ", "nó", "đã", "sẽ", "hay", "về", "theo",
}


def _content_words(text: str) -> set:
    words = re.findall(r"[a-zà-ỹ0-9]+", normalize(text))
    return {w for w in words if len(w) >= 4 and w not in _STOPWORDS}


def apply_grounding_gate(result: dict, slide: dict, clusters: dict, turn_to_user: dict):
    # So khop theo tap tu (khong theo thu tu) vi slide da cot bi pdftotext bo thanh
    # dong doc lap xen ke voi cot khac — so khop chuoi con lien tuc se bao false negative
    # cho nhung cau bi ngat dong giua chung, du AI trich dung noi dung.
    page_words = {p["page"]: _content_words(p["text"]) for p in slide["pages"]}
    warnings = []

    def check_item(item, kind):
        pages = item.get("source_pages", [])
        excerpt_words = _content_words(item.get("source_excerpt", ""))
        grounded = False
        overlap_ratio = 0.0
        if excerpt_words:
            # Excerpt co the gop tu nhieu trang (vd tom tat 1 mach noi dung trai dai 4 trang) —
            # so voi HOP cua tat ca trang duoc khai, khong so tung trang rieng le, tranh false
            # negative khi excerpt chi chua 1/4 tu o moi trang.
            union_words = set()
            for pg in pages:
                union_words |= page_words.get(pg, set())
            if union_words:
                overlap_ratio = len(excerpt_words & union_words) / len(excerpt_words)
            grounded = overlap_ratio >= 0.7
        confidence = item.get("confidence", 0)
        if grounded and confidence >= 0.8:
            item["status"] = "ready"
        else:
            item["status"] = "needs_review"
            warnings.append(
                {
                    "code": "LOW_CONFIDENCE_MAPPING" if not grounded else "LOW_CONFIDENCE_SCORE",
                    "message": f"{kind} '{item.get('id')}' chưa xác minh chắc chắn với slide "
                    f"(grounded={grounded}, confidence={confidence}), cần Lab Coach duyệt.",
                    "item_ids": [item.get("id")],
                }
            )

    for s in result.get("summary", []):
        check_item(s, "summary")
    for it in result.get("class_insights", []):
        check_item(it, "insight")
    for q in result.get("review_questions", []):
        check_item(q, "question")

    cluster_by_id = {c["cluster_id"]: c for c in clusters.get("clusters", [])}
    for insight in result.get("class_insights", []):
        cluster_id = insight["id"].replace("insight-", "")
        cluster = cluster_by_id.get(cluster_id)
        if not cluster:
            continue
        users = {turn_to_user[t] for t in cluster["turn_ids"] if t in turn_to_user}
        insight["unique_user_count"] = len(users)
        insight["question_count"] = len(cluster["turn_ids"])
        insight["representative_questions"] = cluster["representative_questions"]

    result["warnings"] = warnings
    return result


def main():
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    slide_path, clusters_path, questions_path, lesson_title, out_path = sys.argv[1:6]

    with open(slide_path, encoding="utf-8") as f:
        slide = json.load(f)
    with open(clusters_path, encoding="utf-8") as f:
        clusters = json.load(f)
    with open(questions_path, encoding="utf-8") as f:
        questions = json.load(f)

    user_prompt = build_user_prompt(slide, clusters, lesson_title)
    result = call_ai_json("generate", SYSTEM_PROMPT, user_prompt, max_tokens=8000)

    turn_to_user = compute_unique_user_counts(questions)
    result = apply_grounding_gate(result, slide, clusters, turn_to_user)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    n_ready = sum(
        1
        for group in ("summary", "class_insights", "review_questions")
        for item in result.get(group, [])
        if item["status"] == "ready"
    )
    n_total = sum(len(result.get(g, [])) for g in ("summary", "class_insights", "review_questions"))
    print(f"Sinh {n_total} item, {n_ready} 'ready' sau grounding gate, {n_total - n_ready} 'needs_review'.")
    print(f"Da ghi -> {out_path}")


if __name__ == "__main__":
    main()
